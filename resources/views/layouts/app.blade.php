<!DOCTYPE html>
<html lang="pt-BR" class="h-full">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>@yield('title', 'Finanças da Casa')</title>

    <link rel="icon" href="{{ asset('favicon.svg') }}" type="image/svg+xml">
    <link rel="apple-touch-icon" href="{{ asset('favicon.svg') }}">

    {{-- Define o tema antes de pintar a tela (evita flash) --}}
    <script>
        (() => {
            const t = localStorage.getItem('theme');
            if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            }
        })();
    </script>

    <script src="https://cdn.tailwindcss.com?plugins=forms"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: { brand: { DEFAULT: '#4f6ef7', dark: '#3b5de7' } },
                    fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'] }
                }
            }
        }
    </script>

    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet">
    @livewireStyles
    <style>
        /* Faz controles nativos (select/options, scrollbar, inputs) seguirem o tema */
        html { color-scheme: light; }
        html.dark { color-scheme: dark; }

        ::-webkit-scrollbar { width: 10px; height: 10px; }
        ::-webkit-scrollbar-thumb { background: rgba(100,116,139,.35); border-radius: 9999px; }
        [x-cloak] { display: none !important; }

        /* SweetAlert2 — visual */
        .swal2-popup.swal-rounded { border-radius: 1.25rem; }
        .swal2-popup .swal2-confirm,
        .swal2-popup .swal2-cancel { border-radius: 0.75rem; font-weight: 600; padding: 0.6rem 1.25rem; }
        /* SweetAlert2 no tema escuro */
        html.dark .swal2-popup { background: #1e293b; color: #e2e8f0; }
        html.dark .swal2-title,
        html.dark .swal2-html-container { color: #e2e8f0; }
        html.dark .swal2-close { color: #94a3b8; }
    </style>
    @stack('styles')
</head>
<body class="h-full font-sans antialiased bg-slate-50 text-slate-800 dark:bg-slate-950 dark:text-slate-100 transition-colors">

@auth
<div class="min-h-full lg:pl-64">

    {{-- ============ Sidebar (desktop) ============ --}}
    <aside class="hidden lg:flex fixed inset-y-0 left-0 w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-6">
        <a href="{{ route('dashboard') }}" class="flex items-center gap-3 mb-8">
            <span class="w-10 h-10 rounded-2xl bg-brand flex items-center justify-center text-white text-lg shadow-sm">
                <i class="fa-solid fa-wallet"></i>
            </span>
            <div class="leading-tight">
                <p class="font-bold">Finanças da Casa</p>
                <p class="text-xs text-slate-400">Controle mensal</p>
            </div>
        </a>

        <nav class="flex-1 space-y-1">
            <a href="#topo" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i class="fa-solid fa-gauge w-5 text-center"></i> Painel
            </a>
            <a href="#novo-lancamento" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i class="fa-solid fa-circle-plus w-5 text-center"></i> Novo lançamento
            </a>
            <a href="#lancamentos" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i class="fa-solid fa-list-ul w-5 text-center"></i> Lançamentos
            </a>
            <a href="#graficos" class="nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i class="fa-solid fa-chart-pie w-5 text-center"></i> Gráficos
            </a>
        </nav>

        <div class="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <p class="px-3 text-[10px] uppercase font-bold tracking-wider text-slate-400">Dados</p>
            <form method="POST" action="{{ route('data.import.sheet') }}" enctype="multipart/form-data" class="px-3 space-y-2">
                @csrf
                <input type="hidden" name="month" value="{{ request('month', now()->month) }}">
                <input type="hidden" name="year" value="{{ request('year', now()->year) }}">
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">Importar CSV/Excel</label>
                <input type="file" name="file" accept=".csv,.xlsx,.txt" required class="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand file:text-white">
                <button type="submit" class="w-full text-xs font-semibold py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition">Importar planilha</button>
            </form>
            <form method="POST" action="{{ route('data.import.json') }}" enctype="multipart/form-data" class="px-3 space-y-2">
                @csrf
                <label class="block text-xs font-semibold text-slate-500 dark:text-slate-400">Restaurar backup JSON</label>
                <input type="file" name="file" accept=".json,application/json" required class="block w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-600 file:text-white">
                <button type="submit" class="w-full text-xs font-semibold py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">Restaurar JSON</button>
            </form>
            <div class="px-3 flex flex-col gap-1.5 text-xs">
                <a href="{{ asset('template-importacao.csv') }}" download class="text-brand hover:underline"><i class="fa-solid fa-download mr-1"></i> Template CSV</a>
                <a href="{{ asset('template-importacao.xlsx') }}" download class="text-brand hover:underline"><i class="fa-solid fa-download mr-1"></i> Template Excel</a>
                <a href="{{ route('data.export.json') }}" class="text-brand hover:underline"><i class="fa-solid fa-file-export mr-1"></i> Exportar JSON</a>
                <a href="{{ route('data.export.csv', ['month' => request('month', now()->month), 'year' => request('year', now()->year)]) }}" class="text-brand hover:underline"><i class="fa-solid fa-file-csv mr-1"></i> Exportar CSV do mês</a>
                <a href="{{ route('data.export.excel', ['month' => request('month', now()->month), 'year' => request('year', now()->year)]) }}" class="text-brand hover:underline"><i class="fa-solid fa-file-excel mr-1"></i> Exportar Excel do mês</a>
            </div>
            <button type="button" onclick="toggleTheme()" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                <i class="fa-solid fa-moon w-5 text-center dark:hidden"></i>
                <i class="fa-solid fa-sun w-5 text-center hidden dark:inline"></i>
                <span class="dark:hidden">Modo escuro</span>
                <span class="hidden dark:inline">Modo claro</span>
            </button>
            <div class="flex items-center gap-3 px-3">
                <span class="w-9 h-9 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-300 text-sm font-bold">
                    {{ strtoupper(substr(auth()->user()->name, 0, 1)) }}
                </span>
                <div class="min-w-0">
                    <p class="text-sm font-semibold truncate">{{ auth()->user()->name }}</p>
                    <form method="POST" action="{{ route('logout') }}">
                        @csrf
                        <button type="submit" class="text-xs text-slate-400 hover:text-rose-500 transition">
                            <i class="fa-solid fa-right-from-bracket"></i> Sair
                        </button>
                    </form>
                </div>
            </div>
        </div>
    </aside>

    {{-- ============ Topbar (mobile) ============ --}}
    <header class="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 h-14 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <a href="{{ route('dashboard') }}" class="flex items-center gap-2">
            <span class="w-8 h-8 rounded-xl bg-brand flex items-center justify-center text-white text-sm">
                <i class="fa-solid fa-wallet"></i>
            </span>
            <span class="font-bold text-sm">Finanças da Casa</span>
        </a>
        <div class="flex items-center gap-1">
            <button type="button" onclick="toggleTheme()" class="w-9 h-9 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
                <i class="fa-solid fa-moon dark:hidden"></i>
                <i class="fa-solid fa-sun hidden dark:inline"></i>
            </button>
            <form method="POST" action="{{ route('logout') }}">
                @csrf
                <button type="submit" class="w-9 h-9 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-slate-800">
                    <i class="fa-solid fa-right-from-bracket"></i>
                </button>
            </form>
        </div>
    </header>

    {{-- ============ Conteúdo ============ --}}
    <main id="topo" class="px-4 lg:px-8 xl:px-10 py-6 pb-24 lg:pb-10 w-full scroll-mt-16">
        @if(session('success'))
            <div id="flash-success" class="hidden">{{ session('success') }}</div>
        @endif
        @if(session('info'))
            <div id="flash-info" class="hidden">{{ session('info') }}</div>
        @endif
        @if(session('error'))
            <div id="flash-error" class="hidden">{{ session('error') }}</div>
        @endif
        @if($errors->any())
            <div class="mb-4 p-4 rounded-2xl bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30 text-sm">
                <ul class="list-disc pl-4 space-y-0.5">@foreach($errors->all() as $e)<li>{{ $e }}</li>@endforeach</ul>
            </div>
        @endif

        @yield('content')
    </main>

    {{-- ============ Bottom nav (mobile) ============ --}}
    <nav class="lg:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-4 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800">
        <a href="#topo" class="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <i class="fa-solid fa-gauge text-base"></i> Painel
        </a>
        <a href="#novo-lancamento" class="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <i class="fa-solid fa-circle-plus text-base"></i> Novo
        </a>
        <a href="#lancamentos" class="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <i class="fa-solid fa-list-ul text-base"></i> Lista
        </a>
        <a href="#graficos" class="flex flex-col items-center justify-center gap-0.5 py-2.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <i class="fa-solid fa-chart-pie text-base"></i> Gráficos
        </a>
    </nav>
</div>
@else
    {{-- Sem autenticação: só o conteúdo (login) --}}
    <main class="min-h-full flex items-center justify-center p-4">
        <button type="button" onclick="toggleTheme()" class="fixed top-4 right-4 w-10 h-10 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <i class="fa-solid fa-moon dark:hidden"></i>
            <i class="fa-solid fa-sun hidden dark:inline"></i>
        </button>
        @yield('content')
    </main>
@endauth

    <script>
        function toggleTheme() {
            const root = document.documentElement;
            root.classList.toggle('dark');
            localStorage.setItem('theme', root.classList.contains('dark') ? 'dark' : 'light');
            window.dispatchEvent(new CustomEvent('themechange'));
        }
    </script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    @stack('scripts')
    @livewireScripts
</body>
</html>
