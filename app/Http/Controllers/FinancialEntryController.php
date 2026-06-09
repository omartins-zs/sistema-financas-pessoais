<?php

namespace App\Http\Controllers;

use App\Enums\EntryStatus;
use App\Http\Requests\StoreFinancialEntryRequest;
use App\Http\Requests\UpdateFinancialEntryRequest;
use App\Models\FinancialEntry;
use App\Services\FinancialEntryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class FinancialEntryController extends Controller
{
    public function __construct(
        private FinancialEntryService $service
    ) {}

    public function store(StoreFinancialEntryRequest $request): RedirectResponse
    {
        $this->service->create($request->user(), $request->validated());

        return back()->with('success', 'Lançamento adicionado!');
    }

    public function update(UpdateFinancialEntryRequest $request, FinancialEntry $entry): RedirectResponse
    {
        $this->authorize('update', $entry);
        $this->service->update($entry, $request->validated());

        return back()->with('success', 'Lançamento atualizado!');
    }

    public function destroy(FinancialEntry $entry): RedirectResponse
    {
        $this->authorize('delete', $entry);
        $this->service->delete($entry);

        return back()->with('success', 'Lançamento excluído.');
    }

    public function updateStatus(Request $request, FinancialEntry $entry): JsonResponse
    {
        $this->authorize('update', $entry);

        $data = $request->validate([
            'status' => ['required', 'in:paid,reserved,unpaid'],
        ]);

        $this->service->updateStatus($entry, EntryStatus::from($data['status']));

        return response()->json(['success' => true, 'message' => 'Status atualizado!']);
    }
}
