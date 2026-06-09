@extends('layouts.app')

@section('title', 'Dashboard — Finanças da Casa')

@section('content')
@php
    use App\Enums\EntryStatus;
    use App\Enums\EntryType;
    $monthLabel = $months[$month] . ' de ' . $year;
@endphp

{{-- Toolbar mês/ano + ações --}}
<div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-6">
    <div class="flex flex-wrap items-center gap-3">
        <form method="GET" action="{{ route('dashboard') }}" id="filterForm" class="flex items-center bg-slate-50 rounded-full border border-slate-200 p-1 flex-1 min-w-[240px]">
            <button type="button" id="btnPrevMonth" class="w-9 h-9 rounded-full hover:bg-white text-slate-500 hover:text-brand transition">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <select name="month" id="selectMonth" class="flex-1 bg-transparent border-0 text-sm font-semibold text-center focus:ring-0">
                @foreach($months as $num => $name)
                    <option value="{{ $num }}" @selected($month == $num)>{{ $name }}</option>
                @endforeach
            </select>
            <span class="text-slate-300">/</span>
            <select name="year" id="selectYear" class="w-20 bg-transparent border-0 text-sm font-semibold text-center focus:ring-0">
                @for($y = now()->year + 2; $y >= 2020; $y--)
                    <option value="{{ $y }}" @selected($year == $y)>{{ $y }}</option>
                @endfor
            </select>
            <button type="button" id="btnNextMonth" class="w-9 h-9 rounded-full hover:bg-white text-slate-500 hover:text-brand transition">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
            <button type="submit" class="hidden">Filtrar</button>
        </form>

        <form method="POST" action="{{ route('month.copy') }}" class="copy-month-form">
            @csrf
            <input type="hidden" name="month" value="{{ $month }}">
            <input type="hidden" name="year" value="{{ $year }}">
            <button type="submit" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition shadow-md shadow-brand/20">
                <i class="fa-solid fa-copy"></i> <span class="hidden sm:inline">Copiar mês anterior</span><span class="sm:hidden">Copiar</span>
            </button>
        </form>
    </div>
    <p class="text-sm text-slate-500 mt-2"><i class="fa-regular fa-calendar mr-1"></i> {{ $monthLabel }}</p>
</div>

{{-- Cards resumo --}}
<div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
    <div class="bg-white rounded-2xl p-4 border-l-4 border-emerald-500 shadow-sm">
        <i class="fa-solid fa-arrow-down text-emerald-500 text-sm mb-1"></i>
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Entradas</p>
        <p class="text-lg font-bold text-emerald-600">R$ {{ number_format($summary['income'], 2, ',', '.') }}</p>
    </div>
    <div class="bg-white rounded-2xl p-4 border-l-4 border-rose-500 shadow-sm">
        <i class="fa-solid fa-arrow-up text-rose-500 text-sm mb-1"></i>
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Despesas</p>
        <p class="text-lg font-bold text-rose-600">R$ {{ number_format($summary['expense'], 2, ',', '.') }}</p>
    </div>
    <div class="bg-white rounded-2xl p-4 border-l-4 border-indigo-500 shadow-sm">
        <i class="fa-solid fa-wallet text-indigo-500 text-sm mb-1"></i>
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Saldo</p>
        <p class="text-lg font-bold {{ $summary['balance'] >= 0 ? 'text-indigo-600' : 'text-rose-600' }}">R$ {{ number_format($summary['balance'], 2, ',', '.') }}</p>
    </div>
    <div class="bg-white rounded-2xl p-4 border-l-4 border-green-500 shadow-sm">
        <i class="fa-solid fa-circle-check text-green-500 text-sm mb-1"></i>
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Pago</p>
        <p class="text-lg font-bold text-green-600">R$ {{ number_format($summary['paid'], 2, ',', '.') }}</p>
    </div>
    <div class="bg-white rounded-2xl p-4 border-l-4 border-amber-500 shadow-sm">
        <i class="fa-solid fa-clock text-amber-500 text-sm mb-1"></i>
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Reservado</p>
        <p class="text-lg font-bold text-amber-600">R$ {{ number_format($summary['reserved'], 2, ',', '.') }}</p>
    </div>
    <div class="bg-white rounded-2xl p-4 border-l-4 border-red-500 shadow-sm">
        <i class="fa-solid fa-circle-exclamation text-red-500 text-sm mb-1"></i>
        <p class="text-[10px] uppercase font-bold text-slate-400 tracking-wide">Não pago</p>
        <p class="text-lg font-bold text-red-600">R$ {{ number_format($summary['unpaid'], 2, ',', '.') }}</p>
    </div>
</div>

{{-- Formulário novo lançamento --}}
<div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 mb-6">
    <h2 class="font-bold text-slate-800 mb-4 flex items-center gap-2">
        <i class="fa-solid fa-plus-circle text-brand"></i> Novo lançamento
    </h2>
    <form method="POST" action="{{ route('entries.store') }}" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        @csrf
        <input type="hidden" name="month" value="{{ $month }}">
        <input type="hidden" name="year" value="{{ $year }}">
        <div class="sm:col-span-2">
            <label class="text-xs font-semibold text-slate-500">Descrição</label>
            <input type="text" name="description" required placeholder="Ex: Salário, Luz..."
                   class="w-full mt-1 rounded-xl border-slate-200 focus:border-brand focus:ring-brand">
        </div>
        <div>
            <label class="text-xs font-semibold text-slate-500">Categoria</label>
            <select name="category" required class="w-full mt-1 rounded-xl border-slate-200">
                @foreach($categories as $cat)<option value="{{ $cat }}">{{ $cat }}</option>@endforeach
            </select>
        </div>
        <div>
            <label class="text-xs font-semibold text-slate-500">Tipo</label>
            <select name="type" required class="w-full mt-1 rounded-xl border-slate-200">
                <option value="expense">Despesa (-)</option>
                <option value="income">Entrada (+)</option>
            </select>
        </div>
        <div>
            <label class="text-xs font-semibold text-slate-500">Valor (R$)</label>
            <input type="number" name="amount" step="0.01" min="0.01" required placeholder="0,00"
                   class="w-full mt-1 rounded-xl border-slate-200">
        </div>
        <div>
            <label class="text-xs font-semibold text-slate-500">Status</label>
            <select name="status" required class="w-full mt-1 rounded-xl border-slate-200">
                @foreach(EntryStatus::cases() as $s)
                    <option value="{{ $s->value }}" @selected($s === EntryStatus::Unpaid)>{{ $s->label() }}</option>
                @endforeach
            </select>
        </div>
        <div class="sm:col-span-2">
            <label class="text-xs font-semibold text-slate-500">Observação <span class="font-normal">(opcional)</span></label>
            <input type="text" name="notes" class="w-full mt-1 rounded-xl border-slate-200">
        </div>
        <div class="flex items-end">
            <button type="submit" class="w-full py-3 rounded-xl bg-brand text-white font-semibold hover:bg-brand-dark transition">
                <i class="fa-solid fa-plus mr-1"></i> Adicionar
            </button>
        </div>
    </form>
</div>

{{-- Header lançamentos --}}
<div class="flex flex-wrap items-center justify-between gap-3 mb-4">
    <h2 class="font-bold text-slate-800 flex items-center gap-2">
        <i class="fa-solid fa-list text-brand"></i> Lançamentos
        <span class="text-xs bg-brand text-white px-2 py-0.5 rounded-full">{{ $entries->count() }}</span>
    </h2>
    @if($entries->isNotEmpty())
    <form method="POST" action="{{ route('month.clear') }}" class="clear-month-form">
        @csrf @method('DELETE')
        <input type="hidden" name="month" value="{{ $month }}">
        <input type="hidden" name="year" value="{{ $year }}">
        <button type="submit" class="text-sm text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg hover:bg-rose-50">
            <i class="fa-solid fa-trash-can mr-1"></i> Limpar mês
        </button>
    </form>
    @endif
</div>

@if($entries->isEmpty())
<div class="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-200">
    <i class="fa-solid fa-clipboard-list text-4xl text-slate-300 mb-3"></i>
    <p class="font-semibold text-slate-600">Nenhum lançamento neste mês</p>
    <p class="text-sm text-slate-400 mt-1">Adicione acima ou copie o mês anterior</p>
</div>
@else

{{-- Entradas --}}
@include('financial.partials.entries-panel', [
    'title' => 'Entradas e Rendas',
    'icon' => 'fa-coins',
    'headerClass' => 'from-emerald-50',
    'iconClass' => 'text-emerald-500',
    'badgeClass' => 'bg-emerald-500',
    'totalClass' => 'text-emerald-600',
    'hint' => 'Salários, renda extra e valores que entram',
    'items' => $incomeEntries,
    'subtotal' => $summary['income'],
])

{{-- Despesas --}}
@include('financial.partials.entries-panel', [
    'title' => 'Despesas e Lançamentos',
    'icon' => 'fa-cart-shopping',
    'headerClass' => 'from-rose-50',
    'iconClass' => 'text-rose-500',
    'badgeClass' => 'bg-rose-500',
    'totalClass' => 'text-rose-600',
    'hint' => 'Contas, mercado, cartão e gastos',
    'items' => $expenseEntries,
    'subtotal' => $summary['expense'],
])

@endif

{{-- Gráficos --}}
<div class="bg-white rounded-2xl shadow-sm border border-slate-100 mt-6 overflow-hidden">
    <button type="button" class="w-full flex items-center justify-between p-4 text-left font-bold text-slate-800"
            data-accordion-target="#chartsBody" aria-expanded="false">
        <span><i class="fa-solid fa-chart-column text-brand mr-2"></i> Gráficos do mês</span>
        <i class="fa-solid fa-chevron-down text-slate-400"></i>
    </button>
    <div id="chartsBody" class="hidden border-t border-slate-100 p-4">
        <div class="grid md:grid-cols-2 gap-6">
            <div class="bg-slate-50 rounded-xl p-4"><canvas id="chartIncomeExpense" height="200"></canvas></div>
            <div class="bg-slate-50 rounded-xl p-4"><canvas id="chartCategories" height="200"></canvas></div>
        </div>
    </div>
</div>

{{-- Modal editar --}}
<div id="editModal" tabindex="-1" aria-hidden="true"
     class="hidden fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
    <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h3 class="font-bold text-lg mb-4"><i class="fa-solid fa-pen text-brand mr-2"></i> Editar lançamento</h3>
        <form id="editForm" method="POST" class="space-y-4">
            @csrf @method('PUT')
            <div>
                <label class="text-xs font-semibold text-slate-500">Descrição</label>
                <input type="text" name="description" id="edit_description" required class="w-full mt-1 rounded-xl border-slate-200">
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-semibold text-slate-500">Categoria</label>
                    <select name="category" id="edit_category" class="w-full mt-1 rounded-xl border-slate-200">
                        @foreach($categories as $cat)<option value="{{ $cat }}">{{ $cat }}</option>@endforeach
                    </select>
                </div>
                <div>
                    <label class="text-xs font-semibold text-slate-500">Tipo</label>
                    <select name="type" id="edit_type" class="w-full mt-1 rounded-xl border-slate-200">
                        <option value="expense">Despesa</option>
                        <option value="income">Entrada</option>
                    </select>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <label class="text-xs font-semibold text-slate-500">Valor</label>
                    <input type="number" name="amount" id="edit_amount" step="0.01" min="0.01" required class="w-full mt-1 rounded-xl border-slate-200">
                </div>
                <div>
                    <label class="text-xs font-semibold text-slate-500">Status</label>
                    <select name="status" id="edit_status" class="w-full mt-1 rounded-xl border-slate-200">
                        @foreach(EntryStatus::cases() as $s)
                            <option value="{{ $s->value }}">{{ $s->label() }}</option>
                        @endforeach
                    </select>
                </div>
            </div>
            <div>
                <label class="text-xs font-semibold text-slate-500">Observação</label>
                <input type="text" name="notes" id="edit_notes" class="w-full mt-1 rounded-xl border-slate-200">
            </div>
            <div class="flex justify-end gap-2 pt-2">
                <button type="button" id="closeEditModal" class="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100">Cancelar</button>
                <button type="submit" class="px-4 py-2 rounded-xl bg-brand text-white font-semibold">Salvar</button>
            </div>
        </form>
    </div>
</div>
@endsection

@push('scripts')
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
    window.financialConfig = {
        month: {{ $month }},
        year: {{ $year }},
        chartData: @json($chartData),
        updateUrl: '{{ url('/entries') }}',
        csrf: '{{ csrf_token() }}'
    };
</script>
<script src="{{ asset('js/financial.js') }}"></script>
@endpush
