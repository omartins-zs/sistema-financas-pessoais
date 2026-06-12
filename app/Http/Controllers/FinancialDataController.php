<?php

namespace App\Http\Controllers;

use App\Services\FinancialEntryService;
use App\Services\FinancialSheetService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class FinancialDataController extends Controller
{
    public function importSheet(Request $request, FinancialSheetService $sheets): \Illuminate\Http\RedirectResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file', 'mimes:csv,txt,xlsx', 'max:4096'],
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'year' => ['required', 'integer', 'min:2020', 'max:2100'],
        ]);

        $file = $validated['file'];
        $extension = strtolower($file->getClientOriginalExtension());
        $path = $file->getRealPath();

        $count = $sheets->importForMonth(
            $request->user(),
            (int) $validated['month'],
            (int) $validated['year'],
            $path,
            $extension
        );

        if ($count === 0) {
            return back()->with('error', 'Nenhum lançamento válido encontrado. Use o template CSV ou Excel.');
        }

        return redirect()
            ->route('dashboard', ['month' => $validated['month'], 'year' => $validated['year']])
            ->with('success', "{$count} lançamento(s) importado(s)!");
    }

    public function importJson(Request $request, FinancialEntryService $entries): \Illuminate\Http\RedirectResponse
    {
        $request->validate(['file' => ['required', 'file', 'mimes:json', 'max:8192']]);

        $data = json_decode(file_get_contents($request->file('file')->getRealPath()), true);

        if (! is_array($data)) {
            return back()->with('error', 'Arquivo JSON inválido.');
        }

        $entries->restoreFromJson($request->user(), $data);

        return redirect()->route('dashboard')->with('success', 'Backup JSON restaurado com sucesso!');
    }

    public function exportJson(FinancialSheetService $sheets): StreamedResponse
    {
        $json = $sheets->exportJson(auth()->user());

        return Response::streamDownload(
            fn () => print($json),
            'financas-casa-backup-'.now()->format('Y-m-d').'.json',
            ['Content-Type' => 'application/json']
        );
    }

    public function exportCsv(Request $request, FinancialSheetService $sheets): StreamedResponse
    {
        $month = (int) $request->query('month', now()->month);
        $year = (int) $request->query('year', now()->year);
        $entries = app(FinancialEntryService::class)->getEntriesForMonth(auth()->user(), $month, $year);
        $summary = app(FinancialEntryService::class)->getSummary(auth()->user(), $month, $year);

        return Response::streamDownload(function () use ($entries, $summary, $month, $year) {
            echo "\xEF\xBB\xBF";
            $months = config('financial.months');
            echo "Finanças da Casa - {$months[$month]} de {$year}\n\n";
            echo "Descrição;Categoria;Tipo;Valor;Status;Tag;Observação\n";
            foreach ($entries as $e) {
                echo implode(';', [
                    $e->description,
                    $e->category,
                    $e->type->label(),
                    number_format((float) $e->amount, 2, ',', '.'),
                    $e->status->label(),
                    $e->person?->label() ?? '',
                    $e->notes ?? '',
                ])."\n";
            }
            echo "\nSobra;".number_format($summary['surplus'], 2, ',', '.')."\n";
        }, "financas-{$year}-".str_pad((string) $month, 2, '0', STR_PAD_LEFT).'.csv', [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    public function exportExcel(Request $request, FinancialSheetService $sheets): StreamedResponse
    {
        $month = (int) $request->query('month', now()->month);
        $year = (int) $request->query('year', now()->year);
        $tmp = tempnam(sys_get_temp_dir(), 'fin');
        $path = $tmp.'.xlsx';
        rename($tmp, $path);

        $sheets->writeXlsx($sheets->buildMonthSpreadsheet(auth()->user(), $month, $year), $path);

        return response()->download($path, "financas-{$year}-".str_pad((string) $month, 2, '0', STR_PAD_LEFT).'.xlsx')
            ->deleteFileAfterSend(true);
    }
}
