<section class="mb-5 rounded-2xl overflow-hidden shadow-sm border border-slate-100 bg-white">
    <div class="px-5 py-4 bg-gradient-to-r {{ $headerClass }} to-white border-b border-slate-100">
        <div class="flex items-center justify-between flex-wrap gap-2">
            <h3 class="font-bold text-slate-800 flex items-center gap-2">
                <i class="fa-solid {{ $icon }} {{ $iconClass }}"></i>
                {{ $title }}
                <span class="text-xs {{ $badgeClass }} text-white px-2 py-0.5 rounded-full">{{ $items->count() }}</span>
            </h3>
            <strong class="{{ $totalClass }} font-bold">
                R$ {{ number_format($subtotal, 2, ',', '.') }}
            </strong>
        </div>
        <p class="text-xs text-slate-500 mt-1">{{ $hint }}</p>
    </div>

    @if($items->isEmpty())
        <p class="text-center text-sm text-slate-400 py-8">Nenhum lançamento nesta seção</p>
    @else
        <div class="hidden md:block overflow-x-auto p-3">
            <table class="w-full border-separate border-spacing-y-2">
                <thead>
                    <tr class="text-[10px] uppercase tracking-wider text-slate-400">
                        <th class="px-4 text-left font-bold">Descrição</th>
                        <th class="px-4 text-left font-bold">Categoria</th>
                        <th class="px-4 text-left font-bold">Valor</th>
                        <th class="px-4 text-left font-bold">Status</th>
                        <th class="px-4 text-left font-bold">Obs.</th>
                        <th class="px-4 text-right font-bold">Ações</th>
                    </tr>
                </thead>
                <tbody>
                    @foreach($items as $entry)
                        @include('financial.partials.entry-row', ['entry' => $entry])
                    @endforeach
                </tbody>
            </table>
        </div>
        <div class="md:hidden p-3 space-y-3">
            @foreach($items as $entry)
                @include('financial.partials.entry-card', ['entry' => $entry])
            @endforeach
        </div>
    @endif
</section>
