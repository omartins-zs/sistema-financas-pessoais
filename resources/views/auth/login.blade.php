@extends('layouts.app')

@section('title', 'Entrar — Finanças da Casa')

@section('content')
<div class="min-h-[75vh] flex items-center justify-center px-2">
    <div class="w-full max-w-md bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-white p-8">
        <div class="text-center mb-8">
            <span class="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-indigo-400 items-center justify-center text-white text-2xl mb-4">
                <i class="fa-solid fa-house-chimney"></i>
            </span>
            <h1 class="text-2xl font-bold text-slate-800">Finanças da Casa</h1>
            <p class="text-slate-500 text-sm mt-1">Entre para controlar suas finanças</p>
        </div>

        <form method="POST" action="{{ route('login') }}" class="space-y-5">
            @csrf
            <div>
                <label for="email" class="block text-sm font-medium text-slate-600 mb-1">E-mail</label>
                <input type="email" name="email" id="email" value="{{ old('email') }}" required autofocus
                       class="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand">
            </div>
            <div>
                <label for="password" class="block text-sm font-medium text-slate-600 mb-1">Senha</label>
                <input type="password" name="password" id="password" required
                       class="w-full rounded-xl border-slate-200 focus:border-brand focus:ring-brand">
            </div>
            <label class="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="remember" class="rounded border-slate-300 text-brand focus:ring-brand">
                Lembrar de mim
            </label>
            <button type="submit"
                    class="w-full py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold transition shadow-lg shadow-brand/25">
                <i class="fa-solid fa-right-to-bracket mr-2"></i> Entrar
            </button>
        </form>
    </div>
</div>
@endsection
