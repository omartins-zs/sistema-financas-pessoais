<?php

namespace App\Models;

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
        'type',
        'amount',
        'status',
        'month',
        'year',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'type' => EntryType::class,
            'status' => EntryStatus::class,
            'amount' => 'decimal:2',
            'month' => 'integer',
            'year' => 'integer',
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
