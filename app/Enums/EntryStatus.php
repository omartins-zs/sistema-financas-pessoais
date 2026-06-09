<?php

namespace App\Enums;

enum EntryStatus: string
{
    case Paid = 'paid';
    case Reserved = 'reserved';
    case Unpaid = 'unpaid';

    public function label(): string
    {
        return match ($this) {
            self::Paid => 'Pago',
            self::Reserved => 'Reservado',
            self::Unpaid => 'Não pago',
        };
    }

    public function badgeClasses(): string
    {
        return match ($this) {
            self::Paid => 'bg-emerald-100 text-emerald-800 border-emerald-200',
            self::Reserved => 'bg-amber-100 text-amber-800 border-amber-200',
            self::Unpaid => 'bg-rose-100 text-rose-800 border-rose-200',
        };
    }
}
