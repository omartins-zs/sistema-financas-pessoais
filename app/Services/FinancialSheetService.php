<?php

namespace App\Services;

use App\Enums\EntryPerson;
use App\Enums\EntryStatus;
use App\Enums\EntryType;
use App\Models\User;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class FinancialSheetService
{
    public function __construct(
        private readonly FinancialEntryService $entries
    ) {}

    /** @return array<int, array<string, mixed>> */
    public function parseUpload(string $path, string $extension): array
    {
        $rows = strtolower($extension) === 'csv'
            ? $this->readCsv($path)
            : $this->readSpreadsheet($path);

        return $this->rowsToEntries($rows);
    }

    public function importForMonth(User $user, int $month, int $year, string $path, string $extension): int
    {
        $parsed = $this->parseUpload($path, $extension);
        $count = 0;

        foreach ($parsed as $data) {
            $this->entries->create($user, [
                ...$data,
                'month' => $month,
                'year' => $year,
            ]);
            $count++;
        }

        return $count;
    }

    /** @return array<int, array<string, mixed>> */
    private function readCsv(string $path): array
    {
        $content = file_get_contents($path);
        $content = preg_replace('/^\xEF\xBB\xBF/', '', $content) ?? $content;
        $sep = str_contains($content, ';') ? ';' : ',';
        $lines = array_filter(explode("\n", str_replace("\r", '', $content)));

        return array_map(
            fn (string $line) => str_getcsv($line, $sep),
            $lines
        );
    }

    /** @return array<int, array<int, mixed>> */
    private function readSpreadsheet(string $path): array
    {
        $sheet = IOFactory::load($path)->getActiveSheet();

        return $sheet->toArray(null, true, true, false);
    }

    /** @param array<int, array<int, mixed>> $rows */
    private function rowsToEntries(array $rows): array
    {
        if ($rows === []) {
            return [];
        }

        $headerIndex = null;

        foreach ($rows as $i => $row) {
            foreach ($row as $cell) {
                if ($this->norm((string) $cell) === 'descricao') {
                    $headerIndex = $i;
                    break 2;
                }
            }
        }

        if ($headerIndex === null) {
            return [];
        }

        $headers = array_map(fn ($h) => $this->norm((string) $h), $rows[$headerIndex]);
        $entries = [];

        foreach (array_slice($rows, $headerIndex + 1) as $cells) {
            if (! is_array($cells) || ! collect($cells)->filter(fn ($c) => trim((string) $c) !== '')->isNotEmpty()) {
                continue;
            }

            $row = [];
            foreach ($headers as $i => $header) {
                $value = $cells[$i] ?? '';
                if (str_contains($header, 'descricao')) {
                    $row['description'] = trim((string) $value);
                } elseif (str_contains($header, 'categoria')) {
                    $row['category'] = trim((string) $value);
                } elseif ($header === 'tipo' || str_contains($header, 'tipo')) {
                    $row['type_raw'] = trim((string) $value);
                } elseif (str_contains($header, 'valor')) {
                    $row['amount_raw'] = trim((string) $value);
                } elseif (str_contains($header, 'status')) {
                    $row['status_raw'] = trim((string) $value);
                } elseif ($header === 'tag' || str_contains($header, 'pessoa') || str_contains($header, 'respons')) {
                    $row['person_raw'] = trim((string) $value);
                } elseif (str_contains($header, 'observ')) {
                    $row['notes'] = trim((string) $value);
                }
            }

            if ($entry = $this->mapRow($row)) {
                $entries[] = $entry;
            }
        }

        return $entries;
    }

    /** @param array<string, string> $row */
    private function mapRow(array $row): ?array
    {
        $description = $row['description'] ?? '';
        $type = $this->mapType($row['type_raw'] ?? '');
        $amount = $this->parseAmount($row['amount_raw'] ?? '0');

        if ($description === '' || ! $type || $amount <= 0) {
            return null;
        }

        $category = trim($row['category'] ?? 'Outros');
        if ($type === EntryType::Investment) {
            $category = 'Investimentos';
        } elseif (! in_array($category, config('financial.categories'), true)) {
            $category = 'Outros';
        }

        return [
            'description' => $description,
            'category' => $category,
            'type' => $type,
            'person' => EntryPerson::tryFromLabel($row['person_raw'] ?? null),
            'amount' => $amount,
            'status' => $this->mapStatus($row['status_raw'] ?? ''),
            'notes' => $row['notes'] ?? null,
        ];
    }

    private function mapType(string $raw): ?EntryType
    {
        $key = $this->norm($raw);

        return match (true) {
            str_starts_with($key, 'entr') || $key === '+' => EntryType::Income,
            str_starts_with($key, 'invest') || str_starts_with($key, 'reserv') => EntryType::Investment,
            str_starts_with($key, 'desp') || $key === '-' => EntryType::Expense,
            default => null,
        };
    }

    private function mapStatus(string $raw): EntryStatus
    {
        $key = $this->norm($raw);

        return match (true) {
            $key === 'pago' => EntryStatus::Paid,
            str_contains($key, 'reserv') => EntryStatus::Reserved,
            default => EntryStatus::Unpaid,
        };
    }

    private function parseAmount(string $raw): float
    {
        $clean = preg_replace('/[^\d,.-]/', '', $raw) ?? '0';
        if (str_contains($clean, ',') && str_contains($clean, '.')) {
            $clean = str_replace('.', '', $clean);
        }
        $clean = str_replace(',', '.', $clean);

        return max(0, (float) $clean);
    }

    private function norm(string $value): string
    {
        $value = mb_strtolower(trim($value));

        return str_replace(
            ['á', 'à', 'ã', 'â', 'é', 'ê', 'í', 'ó', 'ô', 'õ', 'ú', 'ç'],
            ['a', 'a', 'a', 'a', 'e', 'e', 'i', 'o', 'o', 'o', 'u', 'c'],
            $value
        );
    }

    public function exportJson(User $user): string
    {
        $data = $user->financialEntries()
            ->orderBy('year')
            ->orderBy('month')
            ->get()
            ->groupBy(fn ($e) => sprintf('%04d-%02d', $e->year, $e->month))
            ->map(fn ($group) => $group->map(fn ($e) => [
                'description' => $e->description,
                'category' => $e->category,
                'type' => $e->type->value,
                'person' => $e->person?->value,
                'amount' => (float) $e->amount,
                'status' => $e->status->value,
                'notes' => $e->notes,
                'due_day' => $e->due_day,
            ])->values());

        return json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    public function buildMonthSpreadsheet(User $user, int $month, int $year): Spreadsheet
    {
        $entries = $this->entries->getEntriesForMonth($user, $month, $year);
        $summary = $this->entries->getSummary($user, $month, $year);
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Importacao');

        $headers = ['Descrição', 'Categoria', 'Tipo', 'Valor', 'Status', 'Tag', 'Observação'];
        $sheet->fromArray($headers, null, 'A1');

        $row = 2;
        foreach ($entries as $entry) {
            $sheet->fromArray([
                $entry->description,
                $entry->category,
                $entry->type->label(),
                (float) $entry->amount,
                $entry->status->label(),
                $entry->person?->label() ?? '',
                $entry->notes ?? '',
            ], null, "A{$row}");
            $row++;
        }

        $sheet->setCellValue("I1", 'Sobra');
        $sheet->setCellValue("J1", $summary['surplus']);

        return $spreadsheet;
    }

    public function writeXlsx(Spreadsheet $spreadsheet, string $path): void
    {
        (new Xlsx($spreadsheet))->save($path);
    }
}
