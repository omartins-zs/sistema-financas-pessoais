<?php

namespace App\Services;

use App\Enums\EntryStatus;
use App\Enums\EntryType;
use App\Models\FinancialEntry;
use App\Models\User;
use Illuminate\Support\Collection;

class FinancialEntryService
{
    public function create(User $user, array $data): FinancialEntry
    {
        return $user->financialEntries()->create($data);
    }

    public function update(FinancialEntry $entry, array $data): FinancialEntry
    {
        $entry->update($data);

        return $entry->fresh();
    }

    public function delete(FinancialEntry $entry): void
    {
        $entry->delete();
    }

    public function updateStatus(FinancialEntry $entry, EntryStatus $status): FinancialEntry
    {
        $entry->update(['status' => $status]);

        return $entry->fresh();
    }

    public function getEntriesForMonth(User $user, int $month, int $year): Collection
    {
        return $user->financialEntries()
            ->where('month', $month)
            ->where('year', $year)
            ->orderByRaw("FIELD(type, 'income', 'expense')")
            ->orderBy('description')
            ->get();
    }

    public function getSummary(User $user, int $month, int $year): array
    {
        $entries = $this->getEntriesForMonth($user, $month, $year);

        $summary = [
            'income' => 0,
            'expense' => 0,
            'paid' => 0,
            'reserved' => 0,
            'unpaid' => 0,
        ];

        foreach ($entries as $entry) {
            $amount = (float) $entry->amount;

            if ($entry->type === EntryType::Income) {
                $summary['income'] += $amount;
            } else {
                $summary['expense'] += $amount;
            }

            match ($entry->status) {
                EntryStatus::Paid => $summary['paid'] += $amount,
                EntryStatus::Reserved => $summary['reserved'] += $amount,
                EntryStatus::Unpaid => $summary['unpaid'] += $amount,
            };
        }

        $summary['balance'] = $summary['income'] - $summary['expense'];

        return $summary;
    }

    public function getChartData(User $user, int $month, int $year): array
    {
        $entries = $this->getEntriesForMonth($user, $month, $year);
        $summary = $this->getSummary($user, $month, $year);

        $byCategory = $entries
            ->filter(fn ($e) => $e->type === EntryType::Expense)
            ->groupBy('category')
            ->map(fn ($group) => $group->sum('amount'))
            ->sortDesc();

        return [
            'income_expense' => [
                'labels' => ['Entradas', 'Despesas'],
                'values' => [$summary['income'], $summary['expense']],
            ],
            'by_category' => [
                'labels' => $byCategory->keys()->values()->all(),
                'values' => $byCategory->values()->all(),
            ],
        ];
    }

    public function copyPreviousMonth(User $user, int $month, int $year): array
    {
        $prevMonth = $month === 1 ? 12 : $month - 1;
        $prevYear = $month === 1 ? $year - 1 : $year;

        $previous = $this->getEntriesForMonth($user, $prevMonth, $prevYear);
        $current = $this->getEntriesForMonth($user, $month, $year);

        if ($previous->isEmpty()) {
            return ['copied' => 0, 'skipped' => 0, 'message' => 'O mês anterior não tem lançamentos.'];
        }

        $currentFingerprints = $current->map(fn ($e) => $this->fingerprint($e))->all();

        $copied = 0;
        $skipped = 0;

        foreach ($previous as $entry) {
            if (in_array($this->fingerprint($entry), $currentFingerprints, true)) {
                $skipped++;
                continue;
            }

            $user->financialEntries()->create([
                'description' => $entry->description,
                'category' => $entry->category,
                'type' => $entry->type,
                'amount' => $entry->amount,
                'status' => EntryStatus::Unpaid,
                'month' => $month,
                'year' => $year,
                'notes' => $entry->notes,
                'due_day' => $entry->due_day,
            ]);

            $currentFingerprints[] = $this->fingerprint($entry);
            $copied++;
        }

        return compact('copied', 'skipped');
    }

    public function clearMonth(User $user, int $month, int $year): int
    {
        return $user->financialEntries()
            ->where('month', $month)
            ->where('year', $year)
            ->delete();
    }

    private function fingerprint(FinancialEntry $entry): string
    {
        return implode('|', [
            mb_strtolower(trim($entry->description)),
            $entry->category,
            $entry->type->value,
            number_format((float) $entry->amount, 2, '.', ''),
        ]);
    }
}
