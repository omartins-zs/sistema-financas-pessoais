/**
 * Finanças da Casa — Dashboard JS
 */

const cfg = window.financialConfig ?? {};
const csrf = document.querySelector('meta[name="csrf-token"]')?.content ?? cfg.csrf;

// Navegação de mês
const selectMonth = document.getElementById('selectMonth');
const selectYear = document.getElementById('selectYear');
const filterForm = document.getElementById('filterForm');

const submitFilter = () => filterForm?.requestSubmit();

document.getElementById('btnPrevMonth')?.addEventListener('click', () => {
  let m = parseInt(selectMonth.value) - 1;
  let y = parseInt(selectYear.value);
  if (m < 1) { m = 12; y--; }
  selectMonth.value = m;
  selectYear.value = y;
  submitFilter();
});

document.getElementById('btnNextMonth')?.addEventListener('click', () => {
  let m = parseInt(selectMonth.value) + 1;
  let y = parseInt(selectYear.value);
  if (m > 12) { m = 1; y++; }
  selectMonth.value = m;
  selectYear.value = y;
  submitFilter();
});

selectMonth?.addEventListener('change', submitFilter);
selectYear?.addEventListener('change', submitFilter);

// Status rápido via fetch
const statusClasses = {
  paid: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  reserved: 'bg-amber-100 text-amber-800 border-amber-200',
  unpaid: 'bg-rose-100 text-rose-800 border-rose-200',
};

document.querySelectorAll('.status-select').forEach((select) => {
  select.addEventListener('change', async () => {
    const url = select.dataset.url;
    const status = select.value;

    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': csrf,
          Accept: 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!res.ok) throw new Error();

      select.className = `status-select text-xs font-bold px-3 py-1.5 rounded-full border-2 cursor-pointer ${statusClasses[status]}`;
      location.reload();
    } catch {
      Swal.fire({ icon: 'error', title: 'Erro', text: 'Não foi possível alterar o status.', confirmButtonColor: '#4f6ef7' });
    }
  });
});

// Confirmações SweetAlert2
document.querySelectorAll('.delete-form').forEach((form) => {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    Swal.fire({
      title: 'Excluir lançamento?',
      text: 'Esta ação não pode ser desfeita.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Sim, excluir',
      cancelButtonText: 'Cancelar',
    }).then((r) => { if (r.isConfirmed) form.submit(); });
  });
});

document.querySelector('.clear-month-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  Swal.fire({
    title: 'Limpar mês?',
    text: 'Todos os lançamentos deste mês serão apagados.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Sim, limpar',
    cancelButtonText: 'Cancelar',
  }).then((r) => { if (r.isConfirmed) e.target.submit(); });
});

document.querySelector('.copy-month-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  Swal.fire({
    title: 'Copiar mês anterior?',
    text: 'Lançamentos novos serão adicionados com status "Não pago". Duplicatas serão ignoradas.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonColor: '#4f6ef7',
    cancelButtonColor: '#94a3b8',
    confirmButtonText: 'Sim, copiar',
    cancelButtonText: 'Cancelar',
  }).then((r) => { if (r.isConfirmed) e.target.submit(); });
});

// Modal editar
const editModal = document.getElementById('editModal');
const editForm = document.getElementById('editForm');

const openEdit = (entry) => {
  const data = typeof entry === 'string' ? JSON.parse(entry) : entry;
  editForm.action = `${cfg.updateUrl}/${data.id}`;
  document.getElementById('edit_description').value = data.description;
  document.getElementById('edit_category').value = data.category;
  document.getElementById('edit_type').value = data.type;
  document.getElementById('edit_amount').value = data.amount;
  document.getElementById('edit_status').value = data.status;
  document.getElementById('edit_notes').value = data.notes ?? '';
  editModal.classList.remove('hidden');
};

document.querySelectorAll('.edit-btn').forEach((btn) => {
  btn.addEventListener('click', () => openEdit(btn.dataset.entry));
});

document.getElementById('closeEditModal')?.addEventListener('click', () => {
  editModal.classList.add('hidden');
});

editModal?.addEventListener('click', (e) => {
  if (e.target === editModal) editModal.classList.add('hidden');
});

// Flash messages
const flashSuccess = document.getElementById('flash-success');
const flashError = document.getElementById('flash-error');
const flashInfo = document.getElementById('flash-info');

if (flashSuccess?.textContent.trim()) {
  Swal.fire({ icon: 'success', title: 'Pronto!', text: flashSuccess.textContent.trim(), confirmButtonColor: '#4f6ef7', timer: 2500 });
  flashSuccess.classList.add('hidden');
}
if (flashError?.textContent.trim()) {
  Swal.fire({ icon: 'error', title: 'Ops!', text: flashError.textContent.trim(), confirmButtonColor: '#4f6ef7' });
  flashError.classList.add('hidden');
}
if (flashInfo?.textContent.trim()) {
  Swal.fire({ icon: 'info', title: 'Aviso', text: flashInfo.textContent.trim(), confirmButtonColor: '#4f6ef7' });
  flashInfo.classList.add('hidden');
}

// Gráficos Chart.js
if (cfg.chartData && typeof Chart !== 'undefined') {
  const { income_expense: ie, by_category: cat } = cfg.chartData;

  const fmt = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const ctxIE = document.getElementById('chartIncomeExpense');
  if (ctxIE) {
    new Chart(ctxIE, {
      type: 'bar',
      data: {
        labels: ie.labels,
        datasets: [{ data: ie.values, backgroundColor: ['#10b981', '#f43f5e'], borderRadius: 8 }],
      },
      options: {
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => fmt(c.raw) } } },
        scales: { y: { ticks: { callback: (v) => fmt(v) } } },
      },
    });
  }

  const ctxCat = document.getElementById('chartCategories');
  if (ctxCat && cat.labels.length) {
    new Chart(ctxCat, {
      type: 'doughnut',
      data: {
        labels: cat.labels,
        datasets: [{
          data: cat.values,
          backgroundColor: ['#4f6ef7', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#ec4899', '#64748b'],
          borderWidth: 0,
        }],
      },
      options: {
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } },
      },
    });
  }
}
