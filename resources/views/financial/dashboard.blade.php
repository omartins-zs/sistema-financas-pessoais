@extends('layouts.app')

@section('title', 'Painel — Finanças da Casa')

@section('content')
    <livewire:dashboard />
@endsection

@push('scripts')
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
    // Confirmação reutilizável (SweetAlert2) -> retorna Promise<boolean>
    window.confirmSwal = (opts = {}) => {
        const danger = opts.danger === true;
        return Swal.fire({
            title: opts.title ?? 'Confirmar?',
            text: opts.text ?? '',
            icon: opts.icon ?? 'question',
            showCancelButton: true,
            confirmButtonText: opts.confirmButtonText ?? 'Sim',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: danger ? '#ef4444' : '#4f6ef7',
            cancelButtonColor: '#94a3b8',
            reverseButtons: true,
            focusCancel: danger,
            buttonsStyling: true,
            customClass: { popup: 'swal-rounded' },
        }).then((r) => r.isConfirmed);
    };

    // Toasts disparados pelo Livewire ($this->dispatch('swal', ...))
    document.addEventListener('livewire:init', () => {
        Livewire.on('swal', (event) => {
            const e = Array.isArray(event) ? event[0] : event;
            const map = { success: 'Pronto!', error: 'Ops!', info: 'Aviso' };
            Swal.fire({
                icon: e.type ?? 'success',
                title: map[e.type] ?? '',
                text: e.message ?? '',
                confirmButtonColor: '#4f6ef7',
                timer: e.type === 'success' ? 2200 : undefined,
                timerProgressBar: e.type === 'success',
            });
        });
    });

    // Gerenciador de gráficos (Alpine) — vive dentro de wire:ignore
    window.chartsManager = (initial) => ({
        open: false,
        data: initial,
        ie: null,
        cat: null,
        themeColors() {
            const dark = document.documentElement.classList.contains('dark');
            return {
                grid: dark ? 'rgba(148,163,184,.15)' : 'rgba(100,116,139,.12)',
                tick: dark ? '#94a3b8' : '#64748b',
            };
        },
        build() {
            if (typeof Chart === 'undefined') return;
            const c = this.themeColors();
            Chart.defaults.color = c.tick;
            const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            const ie = this.data.income_expense;
            const cat = this.data.by_category;

            this.ie?.destroy();
            this.ie = new Chart(this.$refs.ie, {
                type: 'bar',
                data: { labels: ie.labels, datasets: [{ data: ie.values, backgroundColor: ['#10b981', '#f43f5e', '#8b5cf6'], borderRadius: 8 }] },
                options: {
                    plugins: { legend: { display: false }, tooltip: { callbacks: { label: (x) => fmt(x.raw) } } },
                    scales: {
                        y: { ticks: { color: c.tick, callback: (v) => fmt(v) }, grid: { color: c.grid } },
                        x: { ticks: { color: c.tick }, grid: { display: false } },
                    },
                },
            });

            this.cat?.destroy();
            if (cat.labels.length) {
                this.cat = new Chart(this.$refs.cat, {
                    type: 'doughnut',
                    data: { labels: cat.labels, datasets: [{ data: cat.values, backgroundColor: ['#4f6ef7', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'], borderWidth: 0 }] },
                    options: { plugins: { legend: { position: 'bottom', labels: { color: c.tick, boxWidth: 12, font: { size: 11 } } } } },
                });
            }
        },
        update(newData) {
            this.data = newData;
            if (this.open) this.$nextTick(() => this.build());
        },
    });
</script>
@endpush
