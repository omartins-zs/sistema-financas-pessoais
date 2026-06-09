<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('financial_entries', function (Blueprint $table) {
            $table->unsignedTinyInteger('due_day')->nullable()->after('notes')
                ->comment('Dia de vencimento (1-31), opcional');
        });
    }

    public function down(): void
    {
        Schema::table('financial_entries', function (Blueprint $table) {
            $table->dropColumn('due_day');
        });
    }
};
