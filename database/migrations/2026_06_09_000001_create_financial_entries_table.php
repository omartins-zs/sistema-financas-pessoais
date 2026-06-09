<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('financial_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('description');
            $table->string('category');
            $table->enum('type', ['income', 'expense']);
            $table->decimal('amount', 10, 2);
            $table->enum('status', ['paid', 'reserved', 'unpaid'])->default('unpaid');
            $table->unsignedTinyInteger('month');
            $table->unsignedSmallInteger('year');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'year', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_entries');
    }
};
