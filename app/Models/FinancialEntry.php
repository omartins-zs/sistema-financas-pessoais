<?php

namespace App\Models;

use App\Enums\EntryPerson;
use App\Enums\EntryStatus;
use App\Enums\EntryType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FinancialEntry extends Model
{
    protected $fillable = [
        'user_id',
        'description',
        'category',
        'person',
        'type',
        'amount',
        'status',
        'month',
        'year',
        'notes',
        'due_day',
    ];

    protected function casts(): array
    {
        return [
            'type' => EntryType::class,
            'person' => EntryPerson::class,
            'status' => EntryStatus::class,
            'amount' => 'decimal:2',
            'month' => 'integer',
            'year' => 'integer',
            'due_day' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function resolveRouteBinding($value, $field = null): self
    {
        $field ??= $this->getRouteKeyName();

        return $this->where($field, $value)
            ->where('user_id', auth()->id())
            ->firstOrFail();
    }
}
