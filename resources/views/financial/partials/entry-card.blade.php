@php
    use App\Enums\EntryStatus;
    use App\Enums\EntryType;
    $entryData = [
        'id' => $entry->id,
        'description' => $entry->description,
        'category' => $entry->category,
        'type' => $entry->type->value,
        'amount' => (float) $entry->amount,
        'status' => $entry->status->value,
        'notes' => $entry->notes,
        'due_day' => $entry->due_day,
    ];
@endphp
<div class="bg-slate-50 rounded-2xl p-4 border border-slate-100">
    <div class="flex justify-between gap-3 mb-2">
        <p class="font-bold text-slate-800">{{ $entry->description }}</p>
        <p class="font-bold whitespace-nowrap {{ $entry->type === EntryType::Income ? 'text-emerald-600' : 'text-rose-600' }}">
            R$ {{ number_format($entry->amount, 2, ',', '.') }}
        </p>
    </div>
    <div class="flex flex-wrap items-center gap-2 mt-1">
        <span class="text-xs px-2.5 py-1 rounded-full bg-white text-slate-600 border border-slate-200">{{ $entry->category }}</span>
        @if($entry->due_day)
            <span class="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                <i class="fa-regular fa-calendar-days"></i> vence dia {{ $entry->due_day }}
            </span>
        @endif
    </div>
    @if($entry->notes)
        <p class="text-sm text-slate-500 italic mt-2">{{ $entry->notes }}</p>
    @endif
    <div class="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-200">
        <select class="status-select flex-1 text-xs font-bold px-3 py-2 rounded-full border-2 {{ $entry->status->badgeClasses() }}"
                data-url="{{ route('entries.status', $entry) }}">
            @foreach(EntryStatus::cases() as $status)
                <option value="{{ $status->value }}" @selected($entry->status === $status)>{{ $status->label() }}</option>
            @endforeach
        </select>
        <div class="flex gap-1">
            <button type="button" class="edit-btn w-9 h-9 rounded-lg bg-brand text-white hover:bg-brand-dark" data-entry='@json($entryData)'>
                <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <form method="POST" action="{{ route('entries.destroy', $entry) }}" class="delete-form inline">
                @csrf @method('DELETE')
                <button type="submit" class="w-9 h-9 rounded-lg bg-rose-500 text-white hover:bg-rose-600">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </form>
        </div>
    </div>
</div>
