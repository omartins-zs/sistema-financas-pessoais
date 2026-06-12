<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_entries', function (Blueprint $table) {
            $table->string('person', 20)->nullable()->after('category');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE financial_entries MODIFY type ENUM('income', 'expense', 'investment') NOT NULL");
        }
    }

    public function down(): void
    {
        Schema::table('financial_entries', function (Blueprint $table) {
            $table->dropColumn('person');
        });

        if (Schema::getConnection()->getDriverName() === 'mysql') {
            DB::table('financial_entries')->where('type', 'investment')->update(['type' => 'expense']);
            DB::statement("ALTER TABLE financial_entries MODIFY type ENUM('income', 'expense') NOT NULL");
        }
    }
};
