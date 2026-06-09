<?php

namespace App\Policies;

use App\Models\FinancialEntry;
use App\Models\User;

class FinancialEntryPolicy
{
    public function view(User $user, FinancialEntry $entry): bool
    {
        return $user->id === $entry->user_id;
    }

    public function update(User $user, FinancialEntry $entry): bool
    {
        return $user->id === $entry->user_id;
    }

    public function delete(User $user, FinancialEntry $entry): bool
    {
        return $user->id === $entry->user_id;
    }
}
