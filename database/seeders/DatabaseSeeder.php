<?php

namespace Database\Seeders;

use App\Enums\EntryStatus;
use App\Enums\EntryType;
use App\Models\User;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $user = User::factory()->create([
            'name' => 'Finanças da Casa',
            'email' => 'casa@financas.com',
            'password' => 'password',
        ]);

        $month = now()->month;
        $year = now()->year;

        $user->financialEntries()->createMany([
            [
                'description' => 'Salário',
                'category' => 'Contribuição para casa',
                'type' => EntryType::Income,
                'amount' => 4500.00,
                'status' => EntryStatus::Paid,
                'month' => $month,
                'year' => $year,
                'notes' => 'Renda principal',
            ],
            [
                'description' => 'Aluguel',
                'category' => 'Aluguel',
                'type' => EntryType::Expense,
                'amount' => 1200.00,
                'status' => EntryStatus::Paid,
                'month' => $month,
                'year' => $year,
            ],
            [
                'description' => 'Mercado',
                'category' => 'Mercado',
                'type' => EntryType::Expense,
                'amount' => 650.00,
                'status' => EntryStatus::Reserved,
                'month' => $month,
                'year' => $year,
            ],
            [
                'description' => 'Luz',
                'category' => 'Luz',
                'type' => EntryType::Expense,
                'amount' => 180.00,
                'status' => EntryStatus::Unpaid,
                'month' => $month,
                'year' => $year,
            ],
        ]);
    }
}
