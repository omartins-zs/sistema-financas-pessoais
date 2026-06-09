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
    ];
    $cell = 'bg-white px-4 py-3 border-y border-slate-100 first:border-l last:border-r';
@endphp
<tr class="group">
    <td class="{{ $cell }} rounded-l-xl font-semibold text-slate-800">{{ $entry->description }}</td>
    <td class="{{ $cell }}">
        <span class="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">{{ $entry->category }}</span>
    </td>
    <td class="{{ $cell }} font-bold {{ $entry->type === EntryType::Income ? 'text-emerald-600' : 'text-rose-600' }}">
        R$ {{ number_format($entry->amount, 2, ',', '.') }}
    </td>
    <td class="{{ $cell }}">
        <select class="status-select text-xs font-bold px-3 py-1.5 rounded-full border-2 cursor-pointer {{ $entry->status->badgeClasses() }}"
                data-url="{{ route('entries.status', $entry) }}">
            @foreach(EntryStatus::cases() as $status)
                <option value="{{ $status->value }}" @selected($entry->status === $status)>{{ $status->label() }}</option>
            @endforeach
        </select>
    </td>
    <td class="{{ $cell }} text-slate-400 text-sm max-w-[120px] truncate" title="{{ $entry->notes }}">{{ $entry->notes ?: '—' }}</td>
    <td class="{{ $cell }} rounded-r-xl text-right">
        <div class="flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100 transition">
            <button type="button" class="edit-btn w-8 h-8 rounded-lg bg-brand text-white hover:bg-brand-dark transition"
                    data-entry='@json($entryData)' title="Editar">
                <i class="fa-solid fa-pen text-xs"></i>
            </button>
            <form method="POST" action="{{ route('entries.destroy', $entry) }}" class="delete-form inline">
                @csrf @method('DELETE')
                <button type="submit" class="w-8 h-8 rounded-lg bg-rose-500 text-white hover:bg-rose-600 transition" title="Excluir">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </form>
        </div>
    </td>
</tr>
