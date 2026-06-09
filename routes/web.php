<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\FinancialDashboardController;
use App\Http\Controllers\FinancialEntryController;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);
});

Route::post('/logout', [LoginController::class, 'destroy'])
    ->middleware('auth')
    ->name('logout');

Route::middleware('auth')->group(function () {
    Route::get('/', [FinancialDashboardController::class, 'index'])->name('dashboard');

    Route::post('/entries', [FinancialEntryController::class, 'store'])->name('entries.store');
    Route::put('/entries/{entry}', [FinancialEntryController::class, 'update'])->name('entries.update');
    Route::delete('/entries/{entry}', [FinancialEntryController::class, 'destroy'])->name('entries.destroy');
    Route::patch('/entries/{entry}/status', [FinancialEntryController::class, 'updateStatus'])->name('entries.status');

    Route::post('/month/copy', [FinancialDashboardController::class, 'copyMonth'])->name('month.copy');
    Route::delete('/month/clear', [FinancialDashboardController::class, 'clearMonth'])->name('month.clear');
});
