<?php

namespace App\Enums;

enum EntryType: string
{
    case Income = 'income';
    case Expense = 'expense';

    public function label(): string
    {
        return match ($this) {
            self::Income => 'Entrada',
            self::Expense => 'Despesa',
        };
    }

    public function colorClass(): string
    {
        return match ($this) {
            self::Income => 'text-emerald-600',
            self::Expense => 'text-rose-600',
        };
    }
}
