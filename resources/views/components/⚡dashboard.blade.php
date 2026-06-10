<?php

use App\Models\FinancialEntry;
use App\Services\FinancialEntryService;
use Livewire\Attributes\Url;
use Livewire\Component;

new class extends Component
{
    #[Url]
    public int $month = 0;

    #[Url]
    public int $year = 0;

    // Novo lançamento
    public string $description = '';
    public string $category = '';
    public string $type = 'expense';
    public ?string $amount = null;
    public string $status = 'unpaid';
    public ?int $due_day = null;
    public string $notes = '';

    // Edição
    public ?int $editingId = null;
    public string $e_description = '';
    public string $e_category = '';
    public string $e_type = 'expense';
    public ?string $e_amount = null;
    public string $e_status = 'unpaid';
    public ?int $e_due_day = null;
    public string $e_notes = '';

    public function mount(): void
    {
        if (! $this->month) {
            $this->month = (int) now()->month;
        }
        if (! $this->year) {
            $this->year = (int) now()->year;
        }
        $this->category = config('financial.categories')[0];
    }

    private function service(): FinancialEntryService
    {
        return app(FinancialEntryService::class);
    }

    private function find(?int $id): ?FinancialEntry
    {
        return $id ? auth()->user()->financialEntries()->find($id) : null;
    }

    private function toast(string $type, string $message): void
    {
        $this->dispatch('swal', type: $type, message: $message);
    }

    private function refreshCharts(): void
    {
        $this->dispatch('charts-updated', data: $this->service()->getChartData(auth()->user(), $this->month, $this->year));
    }

    public function prevMonth(): void
    {
        if ($this->month <= 1) {
            $this->month = 12;
            $this->year--;
        } else {
            $this->month--;
        }
        $this->refreshCharts();
    }

    public function nextMonth(): void
    {
        if ($this->month >= 12) {
            $this->month = 1;
            $this->year++;
        } else {
            $this->month++;
        }
        $this->refreshCharts();
    }

    public function updated($name): void
    {
        if (in_array($name, ['month', 'year'], true)) {
            $this->refreshCharts();
        }
    }

    public function addEntry(): void
    {
        $data = $this->validate([
            'description' => ['required', 'string', 'max:255'],
            'category' => ['required', 'string'],
            'type' => ['required', 'in:income,expense'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'status' => ['required', 'in:paid,reserved,unpaid'],
            'due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $this->service()->create(auth()->user(), [
            ...$data,
            'month' => $this->month,
            'year' => $this->year,
        ]);

        $this->reset(['description', 'amount', 'due_day', 'notes']);
        $this->type = 'expense';
        $this->status = 'unpaid';
        $this->category = config('financial.categories')[0];

        $this->refreshCharts();
        $this->toast('success', 'Lançamento adicionado!');
    }

    public function setStatus(int $id, string $status): void
    {
        if ($entry = $this->find($id)) {
            $this->service()->updateStatus($entry, \App\Enums\EntryStatus::from($status));
            $this->refreshCharts();
        }
    }

    public function startEdit(int $id): void
    {
        if (! $entry = $this->find($id)) {
            return;
        }
        $this->editingId = $entry->id;
        $this->e_description = $entry->description;
        $this->e_category = $entry->category;
        $this->e_type = $entry->type->value;
        $this->e_amount = (string) $entry->amount;
        $this->e_status = $entry->status->value;
        $this->e_due_day = $entry->due_day;
        $this->e_notes = $entry->notes ?? '';
        $this->resetErrorBag();
    }

    public function cancelEdit(): void
    {
        $this->editingId = null;
    }

    public function saveEdit(): void
    {
        if (! $entry = $this->find($this->editingId)) {
            $this->editingId = null;

            return;
        }

        $data = $this->validate([
            'e_description' => ['required', 'string', 'max:255'],
            'e_category' => ['required', 'string'],
            'e_type' => ['required', 'in:income,expense'],
            'e_amount' => ['required', 'numeric', 'min:0.01'],
            'e_status' => ['required', 'in:paid,reserved,unpaid'],
            'e_due_day' => ['nullable', 'integer', 'min:1', 'max:31'],
            'e_notes' => ['nullable', 'string', 'max:255'],
        ]);

        $this->service()->update($entry, [
            'description' => $data['e_description'],
            'category' => $data['e_category'],
            'type' => $data['e_type'],
            'amount' => $data['e_amount'],
            'status' => $data['e_status'],
            'due_day' => $data['e_due_day'],
            'notes' => $data['e_notes'],
        ]);

        $this->editingId = null;
        $this->refreshCharts();
        $this->toast('success', 'Lançamento atualizado!');
    }

    public function deleteEntry(int $id): void
    {
        if ($entry = $this->find($id)) {
            $this->service()->delete($entry);
            $this->refreshCharts();
            $this->toast('success', 'Lançamento excluído.');
        }
    }

    public function copyMonth(): void
    {
        $result = $this->service()->copyPreviousMonth(auth()->user(), $this->month, $this->year);

        if (($result['copied'] ?? 0) === 0 && ($result['skipped'] ?? 0) > 0) {
            $this->toast('info', 'Todos os lançamentos do mês anterior já existem neste mês.');
        } elseif (($result['copied'] ?? 0) === 0) {
            $this->toast('error', $result['message'] ?? 'Nada para copiar.');
        } else {
            $msg = "{$result['copied']} lançamento(s) copiado(s)!";
            if (($result['skipped'] ?? 0) > 0) {
                $msg .= " {$result['skipped']} ignorado(s).";
            }
            $this->refreshCharts();
            $this->toast('success', $msg);
        }
    }

    public function clearMonth(): void
    {
        $deleted = $this->service()->clearMonth(auth()->user(), $this->month, $this->year);

        if ($deleted === 0) {
            $this->toast('info', 'Este mês já está vazio.');
        } else {
            $this->refreshCharts();
            $this->toast('success', "Mês limpo! {$deleted} lançamento(s) removido(s).");
        }
    }

    public function render()
    {
        $user = auth()->user();
        $entries = $this->service()->getEntriesForMonth($user, $this->month, $this->year);

        return $this->view([
            'months' => config('financial.months'),
            'categories' => config('financial.categories'),
            'entries' => $entries,
            'incomeEntries' => $entries->where('type', \App\Enums\EntryType::Income),
            'expenseEntries' => $entries->where('type', \App\Enums\EntryType::Expense),
            'summary' => $this->service()->getSummary($user, $this->month, $this->year),
            'chartData' => $this->service()->getChartData($user, $this->month, $this->year),
        ]);
    }
};
?>

@php
    $monthLabel = $months[$month] . ' de ' . $year;
    $inp = 'w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-brand focus:ring-2 focus:ring-brand/30 text-sm placeholder:text-slate-400 transition';
    $lbl = 'block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5';
    $card = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl';
    $err = 'text-xs text-rose-500 mt-1';
@endphp

<div>
    {{-- Cabeçalho --}}
    <div class="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
            <h1 class="text-2xl font-bold tracking-tight">Painel</h1>
            <p class="text-sm text-slate-500 dark:text-slate-400 mt-0.5 capitalize">
                <i class="fa-regular fa-calendar mr-1"></i> {{ $monthLabel }}
            </p>
        </div>

        <div class="flex items-center gap-2">
            <div class="flex items-center {{ $card }} p-1">
                <button type="button" wire:click="prevMonth" class="w-9 h-9 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <i class="fa-solid fa-chevron-left"></i>
                </button>
                <select wire:model.live="month" class="shrink-0 w-32 sm:w-36 bg-transparent border-0 pl-2 pr-7 text-sm font-semibold focus:ring-0 dark:text-slate-100 dark:bg-slate-900">
                    @foreach($months as $num => $name)
                        <option value="{{ $num }}">{{ $name }}</option>
                    @endforeach
                </select>
                <select wire:model.live="year" class="shrink-0 w-[5.5rem] bg-transparent border-0 pl-2 pr-7 text-sm font-semibold focus:ring-0 dark:text-slate-100 dark:bg-slate-900">
                    @for($y = now()->year + 2; $y >= 2020; $y--)
                        <option value="{{ $y }}">{{ $y }}</option>
                    @endfor
                </select>
                <button type="button" wire:click="nextMonth" class="w-9 h-9 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                    <i class="fa-solid fa-chevron-right"></i>
                </button>
            </div>

            <button type="button"
                    @click="confirmSwal({title:'Copiar mês anterior?', text:'Os novos lançamentos virão como Não pago e duplicatas serão ignoradas.', icon:'question', confirmButtonText:'Sim, copiar'}).then(ok => ok && $wire.copyMonth())"
                    class="inline-flex items-center gap-2 h-11 px-4 rounded-2xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition">
                <i class="fa-solid fa-copy"></i> <span class="hidden sm:inline">Copiar mês</span>
            </button>
        </div>
    </div>

    {{-- Saldo --}}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
        <div class="rounded-2xl p-5 bg-brand text-white">
            <p class="text-xs font-semibold uppercase tracking-wide text-white/70">Saldo do mês</p>
            <p class="text-3xl font-bold mt-1">R$ {{ number_format($summary['balance'], 2, ',', '.') }}</p>
            <p class="text-xs text-white/70 mt-2">
                <i class="fa-solid fa-arrow-trend-up"></i>
                {{ $summary['balance'] >= 0 ? 'Contas no azul' : 'Atenção: saldo negativo' }}
            </p>
        </div>
        <div class="lg:col-span-2 grid grid-cols-2 gap-3">
            <div class="{{ $card }} p-4">
                <div class="flex items-center gap-2 text-emerald-500 mb-1">
                    <i class="fa-solid fa-arrow-down text-xs"></i>
                    <span class="text-[11px] uppercase font-bold tracking-wide text-slate-400">Entradas</span>
                </div>
                <p class="text-xl font-bold text-emerald-600 dark:text-emerald-400">R$ {{ number_format($summary['income'], 2, ',', '.') }}</p>
            </div>
            <div class="{{ $card }} p-4">
                <div class="flex items-center gap-2 text-rose-500 mb-1">
                    <i class="fa-solid fa-arrow-up text-xs"></i>
                    <span class="text-[11px] uppercase font-bold tracking-wide text-slate-400">Despesas</span>
                </div>
                <p class="text-xl font-bold text-rose-600 dark:text-rose-400">R$ {{ number_format($summary['expense'], 2, ',', '.') }}</p>
            </div>
        </div>
    </div>

    {{-- Status --}}
    <div class="grid grid-cols-3 gap-3 mb-8">
        <div class="{{ $card }} p-4">
            <span class="inline-flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wide text-slate-400">
                <span class="w-2 h-2 rounded-full bg-emerald-500"></span> Pago
            </span>
            <p class="text-lg font-bold mt-1">R$ {{ number_format($summary['paid'], 2, ',', '.') }}</p>
        </div>
        <div class="{{ $card }} p-4">
            <span class="inline-flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wide text-slate-400">
                <span class="w-2 h-2 rounded-full bg-amber-500"></span> Reservado
            </span>
            <p class="text-lg font-bold mt-1">R$ {{ number_format($summary['reserved'], 2, ',', '.') }}</p>
        </div>
        <div class="{{ $card }} p-4">
            <span class="inline-flex items-center gap-1.5 text-[11px] uppercase font-bold tracking-wide text-slate-400">
                <span class="w-2 h-2 rounded-full bg-rose-500"></span> Não pago
            </span>
            <p class="text-lg font-bold mt-1">R$ {{ number_format($summary['unpaid'], 2, ',', '.') }}</p>
        </div>
    </div>

    {{-- Novo lançamento --}}
    <section id="novo-lancamento" class="{{ $card }} p-5 mb-8 scroll-mt-20">
        <h2 class="font-bold mb-4 flex items-center gap-2"><i class="fa-solid fa-circle-plus text-brand"></i> Novo lançamento</h2>
        <form wire:submit="addEntry" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="sm:col-span-2">
                <label class="{{ $lbl }}">Descrição</label>
                <input type="text" wire:model="description" placeholder="Ex: Salário, Luz..." class="{{ $inp }}">
                @error('description') <p class="{{ $err }}">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="{{ $lbl }}">Categoria</label>
                <select wire:model="category" class="{{ $inp }}">
                    @foreach($categories as $cat)<option value="{{ $cat }}">{{ $cat }}</option>@endforeach
                </select>
            </div>
            <div>
                <label class="{{ $lbl }}">Tipo</label>
                <select wire:model="type" class="{{ $inp }}">
                    <option value="expense">Despesa (-)</option>
                    <option value="income">Entrada (+)</option>
                </select>
            </div>
            <div>
                <label class="{{ $lbl }}">Valor (R$)</label>
                <input type="number" step="0.01" min="0.01" wire:model="amount" placeholder="0,00" class="{{ $inp }}">
                @error('amount') <p class="{{ $err }}">{{ $message }}</p> @enderror
            </div>
            <div>
                <label class="{{ $lbl }}">Status</label>
                <select wire:model="status" class="{{ $inp }}">
                    @foreach(\App\Enums\EntryStatus::cases() as $s)<option value="{{ $s->value }}">{{ $s->label() }}</option>@endforeach
                </select>
            </div>
            <div>
                <label class="{{ $lbl }}"><i class="fa-regular fa-calendar-days mr-1"></i> Vencimento <span class="font-normal">(dia)</span></label>
                <input type="number" min="1" max="31" wire:model="due_day" placeholder="Ex: 10" class="{{ $inp }}">
                @error('due_day') <p class="{{ $err }}">{{ $message }}</p> @enderror
            </div>
            <div class="sm:col-span-2 lg:col-span-1">
                <label class="{{ $lbl }}">Observação <span class="font-normal">(opcional)</span></label>
                <input type="text" wire:model="notes" placeholder="Opcional" class="{{ $inp }}">
            </div>
            <div class="sm:col-span-2 lg:col-span-4 flex sm:justify-end pt-1">
                <button type="submit" class="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark transition">
                    <span wire:loading.remove wire:target="addEntry"><i class="fa-solid fa-plus mr-1"></i> Adicionar lançamento</span>
                    <span wire:loading wire:target="addEntry"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Adicionando...</span>
                </button>
            </div>
        </form>
    </section>

    {{-- Lançamentos --}}
    <div id="lancamentos" class="flex items-center justify-between gap-3 mb-4 scroll-mt-20">
        <h2 class="font-bold flex items-center gap-2">
            <i class="fa-solid fa-list-ul text-brand"></i> Lançamentos
            <span class="text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full">{{ $entries->count() }}</span>
        </h2>
        @if($entries->isNotEmpty())
            <button type="button"
                    @click="confirmSwal({title:'Limpar mês?', text:'Todos os lançamentos deste mês serão apagados. Esta ação não pode ser desfeita.', icon:'warning', confirmButtonText:'Sim, limpar', danger:true}).then(ok => ok && $wire.clearMonth())"
                    class="text-sm text-rose-500 hover:text-rose-600 border border-rose-200 dark:border-rose-500/30 px-3 py-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition">
                <i class="fa-solid fa-trash-can mr-1"></i> Limpar mês
            </button>
        @endif
    </div>

    @if($entries->isEmpty())
        <div class="text-center py-16 {{ $card }} border-dashed">
            <i class="fa-solid fa-clipboard-list text-4xl text-slate-300 dark:text-slate-600 mb-3"></i>
            <p class="font-semibold text-slate-600 dark:text-slate-300">Nenhum lançamento neste mês</p>
            <p class="text-sm text-slate-400 mt-1">Adicione acima ou copie o mês anterior</p>
        </div>
    @else
        @php
            $sections = [
                ['title' => 'Entradas e Rendas', 'icon' => 'fa-coins', 'accent' => 'emerald', 'text' => 'text-emerald-500', 'badge' => 'bg-emerald-500', 'total' => 'text-emerald-600 dark:text-emerald-400', 'hint' => 'Salários, renda extra e valores que entram', 'items' => $incomeEntries, 'subtotal' => $summary['income']],
                ['title' => 'Despesas e Lançamentos', 'icon' => 'fa-cart-shopping', 'accent' => 'rose', 'text' => 'text-rose-500', 'badge' => 'bg-rose-500', 'total' => 'text-rose-600 dark:text-rose-400', 'hint' => 'Contas, mercado, cartão e gastos', 'items' => $expenseEntries, 'subtotal' => $summary['expense']],
            ];
        @endphp

        @foreach($sections as $sec)
            <section class="mb-5 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div class="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <h3 class="font-bold flex items-center gap-2">
                            <i class="fa-solid {{ $sec['icon'] }} {{ $sec['text'] }}"></i>
                            {{ $sec['title'] }}
                            <span class="text-xs {{ $sec['badge'] }} text-white px-2 py-0.5 rounded-full">{{ $sec['items']->count() }}</span>
                        </h3>
                        <strong class="{{ $sec['total'] }} font-bold">R$ {{ number_format($sec['subtotal'], 2, ',', '.') }}</strong>
                    </div>
                    <p class="text-xs text-slate-400 mt-1">{{ $sec['hint'] }}</p>
                </div>

                @if($sec['items']->isEmpty())
                    <p class="text-center text-sm text-slate-400 py-8">Nenhum lançamento nesta seção</p>
                @else
                    {{-- Desktop --}}
                    <div class="hidden md:block overflow-x-auto p-3">
                        <table class="w-full border-separate border-spacing-y-2">
                            <thead>
                                <tr class="text-[10px] uppercase tracking-wider text-slate-400">
                                    <th class="px-4 text-left font-bold">Descrição</th>
                                    <th class="px-4 text-left font-bold">Categoria</th>
                                    <th class="px-4 text-left font-bold">Valor</th>
                                    <th class="px-4 text-left font-bold">Status</th>
                                    <th class="px-4 text-left font-bold">Vencimento</th>
                                    <th class="px-4 text-left font-bold">Obs.</th>
                                    <th class="px-4 text-right font-bold">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                @foreach($sec['items'] as $entry)
                                    @php $cell = 'bg-slate-50 dark:bg-slate-800/50 px-4 py-3 border-y border-slate-100 dark:border-slate-800'; @endphp
                                    <tr wire:key="row-{{ $entry->id }}" class="group">
                                        <td class="{{ $cell }} rounded-l-xl border-l border-slate-100 dark:border-slate-800 font-semibold">{{ $entry->description }}</td>
                                        <td class="{{ $cell }}">
                                            <span class="text-xs px-2.5 py-1 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{{ $entry->category }}</span>
                                        </td>
                                        <td class="{{ $cell }} font-bold {{ $entry->type === \App\Enums\EntryType::Income ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' }}">
                                            R$ {{ number_format($entry->amount, 2, ',', '.') }}
                                        </td>
                                        <td class="{{ $cell }}">
                                            <select wire:change="setStatus({{ $entry->id }}, $event.target.value)"
                                                    class="text-xs font-bold px-3 py-1.5 rounded-full border-2 cursor-pointer {{ $entry->status->badgeClasses() }}">
                                                @foreach(\App\Enums\EntryStatus::cases() as $st)
                                                    <option value="{{ $st->value }}" @selected($entry->status === $st)>{{ $st->label() }}</option>
                                                @endforeach
                                            </select>
                                        </td>
                                        <td class="{{ $cell }} text-sm whitespace-nowrap">
                                            @if($entry->due_day)
                                                <span class="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30">
                                                    <i class="fa-regular fa-calendar-days"></i> dia {{ $entry->due_day }}
                                                </span>
                                            @else
                                                <span class="text-slate-300 dark:text-slate-600">—</span>
                                            @endif
                                        </td>
                                        <td class="{{ $cell }} text-slate-400 text-sm max-w-[260px] truncate" title="{{ $entry->notes }}">{{ $entry->notes ?: '—' }}</td>
                                        <td class="{{ $cell }} rounded-r-xl border-r border-slate-100 dark:border-slate-800 text-right">
                                            <div class="flex items-center justify-end gap-1">
                                                <button type="button" wire:click="startEdit({{ $entry->id }})" class="w-8 h-8 rounded-lg bg-brand text-white hover:bg-brand-dark transition" title="Editar">
                                                    <i class="fa-solid fa-pen text-xs"></i>
                                                </button>
                                                <button type="button"
                                                        @click="confirmSwal({title:'Excluir lançamento?', text:'Esta ação não pode ser desfeita.', icon:'warning', confirmButtonText:'Sim, excluir', danger:true}).then(ok => ok && $wire.deleteEntry({{ $entry->id }}))"
                                                        class="w-8 h-8 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition" title="Excluir">
                                                    <i class="fa-solid fa-trash text-xs"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                @endforeach
                            </tbody>
                        </table>
                    </div>

                    {{-- Mobile --}}
                    <div class="md:hidden p-3 space-y-3">
                        @foreach($sec['items'] as $entry)
                            <div wire:key="card-{{ $entry->id }}" class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                                <div class="flex justify-between gap-3 mb-2">
                                    <p class="font-bold">{{ $entry->description }}</p>
                                    <p class="font-bold whitespace-nowrap {{ $entry->type === \App\Enums\EntryType::Income ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400' }}">
                                        R$ {{ number_format($entry->amount, 2, ',', '.') }}
                                    </p>
                                </div>
                                <div class="flex flex-wrap items-center gap-2 mt-1">
                                    <span class="text-xs px-2.5 py-1 rounded-full bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">{{ $entry->category }}</span>
                                    @if($entry->due_day)
                                        <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30">
                                            <i class="fa-regular fa-calendar-days"></i> vence dia {{ $entry->due_day }}
                                        </span>
                                    @endif
                                </div>
                                @if($entry->notes)
                                    <p class="text-sm text-slate-500 dark:text-slate-400 italic mt-2">{{ $entry->notes }}</p>
                                @endif
                                <div class="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <select wire:change="setStatus({{ $entry->id }}, $event.target.value)"
                                            class="flex-1 text-xs font-bold px-3 py-2 rounded-full border-2 {{ $entry->status->badgeClasses() }}">
                                        @foreach(\App\Enums\EntryStatus::cases() as $st)
                                            <option value="{{ $st->value }}" @selected($entry->status === $st)>{{ $st->label() }}</option>
                                        @endforeach
                                    </select>
                                    <div class="flex gap-1">
                                        <button type="button" wire:click="startEdit({{ $entry->id }})" class="w-9 h-9 rounded-lg bg-brand text-white hover:bg-brand-dark">
                                            <i class="fa-solid fa-pen text-xs"></i>
                                        </button>
                                        <button type="button"
                                                @click="confirmSwal({title:'Excluir lançamento?', text:'Esta ação não pode ser desfeita.', icon:'warning', confirmButtonText:'Sim, excluir', danger:true}).then(ok => ok && $wire.deleteEntry({{ $entry->id }}))"
                                                class="w-9 h-9 rounded-lg bg-rose-500 text-white hover:bg-rose-600">
                                            <i class="fa-solid fa-trash text-xs"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        @endforeach
                    </div>
                @endif
            </section>
        @endforeach
    @endif

    {{-- Gráficos --}}
    <section id="graficos" wire:ignore
             x-data="chartsManager(@js($chartData))"
             @charts-updated.window="update($event.detail.data)"
             class="{{ $card }} mt-8 overflow-hidden scroll-mt-20">
        <button type="button" @click="open = !open; if (open) $nextTick(() => build())" class="w-full flex items-center justify-between p-5 text-left font-bold">
            <span><i class="fa-solid fa-chart-pie text-brand mr-2"></i> Gráficos do mês</span>
            <i class="fa-solid fa-chevron-down text-slate-400 transition-transform" :class="open && 'rotate-180'"></i>
        </button>
        <div x-show="open" x-cloak class="border-t border-slate-200 dark:border-slate-800 p-5">
            <div class="grid md:grid-cols-2 gap-5">
                <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                    <p class="text-xs font-semibold text-slate-400 mb-2">Entradas x Despesas</p>
                    <canvas x-ref="ie" height="200"></canvas>
                </div>
                <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4">
                    <p class="text-xs font-semibold text-slate-400 mb-2">Despesas por categoria</p>
                    <canvas x-ref="cat" height="200"></canvas>
                </div>
            </div>
        </div>
    </section>

    {{-- Modal editar --}}
    @if($editingId)
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
             x-on:keydown.escape.window="$wire.cancelEdit()">
            <div class="bg-white dark:bg-slate-900 rounded-3xl shadow-xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-800">
                <h3 class="font-bold text-lg mb-4"><i class="fa-solid fa-pen text-brand mr-2"></i> Editar lançamento</h3>
                <form wire:submit="saveEdit" class="space-y-4">
                    <div>
                        <label class="{{ $lbl }}">Descrição</label>
                        <input type="text" wire:model="e_description" class="{{ $inp }}">
                        @error('e_description') <p class="{{ $err }}">{{ $message }}</p> @enderror
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="{{ $lbl }}">Categoria</label>
                            <select wire:model="e_category" class="{{ $inp }}">
                                @foreach($categories as $cat)<option value="{{ $cat }}">{{ $cat }}</option>@endforeach
                            </select>
                        </div>
                        <div>
                            <label class="{{ $lbl }}">Tipo</label>
                            <select wire:model="e_type" class="{{ $inp }}">
                                <option value="expense">Despesa</option>
                                <option value="income">Entrada</option>
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="{{ $lbl }}">Valor</label>
                            <input type="number" step="0.01" min="0.01" wire:model="e_amount" class="{{ $inp }}">
                            @error('e_amount') <p class="{{ $err }}">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="{{ $lbl }}">Status</label>
                            <select wire:model="e_status" class="{{ $inp }}">
                                @foreach(\App\Enums\EntryStatus::cases() as $s)<option value="{{ $s->value }}">{{ $s->label() }}</option>@endforeach
                            </select>
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="{{ $lbl }}"><i class="fa-regular fa-calendar-days mr-1"></i> Vencimento (dia)</label>
                            <input type="number" min="1" max="31" wire:model="e_due_day" placeholder="Ex: 10" class="{{ $inp }}">
                            @error('e_due_day') <p class="{{ $err }}">{{ $message }}</p> @enderror
                        </div>
                        <div>
                            <label class="{{ $lbl }}">Observação</label>
                            <input type="text" wire:model="e_notes" class="{{ $inp }}">
                        </div>
                    </div>
                    <div class="flex justify-end gap-2 pt-2">
                        <button type="button" wire:click="cancelEdit" class="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Cancelar</button>
                        <button type="submit" class="px-5 py-2.5 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark transition">Salvar</button>
                    </div>
                </form>
            </div>
        </div>
    @endif
</div>
