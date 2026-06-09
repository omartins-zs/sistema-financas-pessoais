<?php

namespace App\Http\Controllers;

use App\Enums\EntryType;
use App\Services\FinancialEntryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class FinancialDashboardController extends Controller
{
    public function __construct(
        private FinancialEntryService $service
    ) {}

    public function index(Request $request): View
    {
        $month = (int) $request->input('month', now()->month);
        $year = (int) $request->input('year', now()->year);
        $user = $request->user();

        $entries = $this->service->getEntriesForMonth($user, $month, $year);
        $summary = $this->service->getSummary($user, $month, $year);
        $chartData = $this->service->getChartData($user, $month, $year);

        $incomeEntries = $entries->filter(fn ($e) => $e->type === EntryType::Income);
        $expenseEntries = $entries->filter(fn ($e) => $e->type === EntryType::Expense);

        return view('financial.dashboard', [
            'month' => $month,
            'year' => $year,
            'months' => config('financial.months'),
            'categories' => config('financial.categories'),
            'entries' => $entries,
            'incomeEntries' => $incomeEntries,
            'expenseEntries' => $expenseEntries,
            'summary' => $summary,
            'chartData' => $chartData,
        ]);
    }

    public function copyMonth(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'year' => ['required', 'integer'],
        ]);

        $result = $this->service->copyPreviousMonth(
            $request->user(),
            (int) $data['month'],
            (int) $data['year']
        );

        if ($result['copied'] === 0 && ($result['skipped'] ?? 0) > 0) {
            return back()->with('info', 'Todos os lançamentos do mês anterior já existem neste mês.');
        }

        if ($result['copied'] === 0) {
            return back()->with('error', $result['message'] ?? 'Nada para copiar.');
        }

        $msg = "{$result['copied']} lançamento(s) copiado(s)!";
        if (($result['skipped'] ?? 0) > 0) {
            $msg .= " {$result['skipped']} ignorado(s) (já existiam).";
        }

        return back()->with('success', $msg);
    }

    public function clearMonth(Request $request): RedirectResponse
    {
        $data = $request->validate([
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'year' => ['required', 'integer'],
        ]);

        $deleted = $this->service->clearMonth(
            $request->user(),
            (int) $data['month'],
            (int) $data['year']
        );

        if ($deleted === 0) {
            return back()->with('info', 'Este mês já está vazio.');
        }

        return back()->with('success', "Mês limpo! {$deleted} lançamento(s) removido(s).");
    }
}
