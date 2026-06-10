@extends('layouts.app')

@section('title', 'Entrar — Finanças da Casa')

@section('content')
<div class="w-full max-w-sm">
    <div class="text-center mb-8">
        <span class="inline-flex w-14 h-14 rounded-2xl bg-brand items-center justify-center text-white text-2xl mb-4 shadow-sm">
            <i class="fa-solid fa-wallet"></i>
        </span>
        <h1 class="text-2xl font-bold tracking-tight">Finanças da Casa</h1>
        <p class="text-slate-500 dark:text-slate-400 text-sm mt-1">Entre para continuar</p>
    </div>

    <div class="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm p-7">
        <form method="POST" action="{{ route('login') }}" class="space-y-5">
            @csrf
            <div>
                <label for="email" class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">E-mail</label>
                <input type="email" name="email" id="email" value="{{ old('email') }}" required autofocus
                       placeholder="voce@email.com"
                       class="w-full rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-brand focus:ring-brand placeholder:text-slate-400">
            </div>
            <div>
                <label for="password" class="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Senha</label>
                <input type="password" name="password" id="password" required placeholder="••••••"
                       class="w-full rounded-xl border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 focus:border-brand focus:ring-brand placeholder:text-slate-400">
            </div>
            <label class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 select-none">
                <input type="checkbox" name="remember" class="rounded border-slate-300 dark:border-slate-600 text-brand focus:ring-brand">
                Lembrar de mim
            </label>
            <button type="submit"
                    class="w-full py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold transition">
                <i class="fa-solid fa-right-to-bracket mr-2"></i> Entrar
            </button>
        </form>
    </div>

    <p class="text-center text-xs text-slate-400 mt-6">Controle mensal das finanças da casa</p>
</div>
@endsection
