<?php

namespace App\Enums;

enum EntryType: string
{
    case Income = 'income';
    case Expense = 'expense';
    case Investment = 'investment';

    public function label(): string
    {
        return match ($this) {
            self::Income => 'Entrada',
            self::Expense => 'Despesa',
            self::Investment => 'Investimento',
        };
    }

    public function colorClass(): string
    {
        return match ($this) {
            self::Income => 'text-emerald-600',
            self::Expense => 'text-rose-600',
            self::Investment => 'text-violet-600',
        };
    }
}
