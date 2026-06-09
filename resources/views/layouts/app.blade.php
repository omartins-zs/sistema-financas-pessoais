<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Finanças da Casa')</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        brand: { DEFAULT: '#4f6ef7', dark: '#3b5de7' }
                    }
                }
            }
        }
    </script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.css" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    @stack('styles')
</head>
<body class="bg-gradient-to-br from-slate-100 via-white to-indigo-50 text-slate-800 antialiased min-h-screen">
    @auth
    <nav class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
            <a href="{{ route('dashboard') }}" class="flex items-center gap-3">
                <span class="w-10 h-10 rounded-xl bg-gradient-to-br from-brand to-indigo-400 flex items-center justify-center text-white text-lg">
                    <i class="fa-solid fa-house-chimney"></i>
                </span>
                <div>
                    <p class="font-bold text-slate-800 leading-tight">Finanças da Casa</p>
                    <p class="text-xs text-slate-500">{{ auth()->user()->name }}</p>
                </div>
            </a>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button type="submit" class="text-sm text-slate-500 hover:text-rose-600 flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-rose-50 transition">
                    <i class="fa-solid fa-right-from-bracket"></i> Sair
                </button>
            </form>
        </div>
    </nav>
    @endauth

    <main class="max-w-6xl mx-auto px-4 py-6">
        @if(session('success'))
            <div id="flash-success" class="mb-4 p-4 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm">{{ session('success') }}</div>
        @endif
        @if(session('info'))
            <div id="flash-info" class="mb-4 p-4 rounded-xl bg-sky-50 text-sky-800 border border-sky-200 text-sm">{{ session('info') }}</div>
        @endif
        @if(session('error'))
            <div id="flash-error" class="mb-4 p-4 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-sm">{{ session('error') }}</div>
        @endif
        @if($errors->any())
            <div class="mb-4 p-4 rounded-xl bg-rose-50 text-rose-800 border border-rose-200 text-sm">
                <ul class="list-disc pl-4">@foreach($errors->all() as $e)<li>{{ $e }}</li>@endforeach</ul>
            </div>
        @endif

        @yield('content')
    </main>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/2.3.0/flowbite.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    @stack('scripts')
</body>
</html>
