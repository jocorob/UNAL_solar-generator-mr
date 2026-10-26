const capacity = document.querySelector('#capacity');
const load = document.querySelector('#load');
const capacityValue = document.querySelector('#capacity-value');
const loadValue = document.querySelector('#load-value');
const runtime = document.querySelector('#runtime');
const example = document.querySelector('#example');

function updateEstimate() {
  const wattHours = Number(capacity.value);
  const watts = Number(load.value);
  const hours = wattHours / watts;
  capacityValue.value = wattHours;
  loadValue.value = watts;
  runtime.innerHTML = `${hours.toLocaleString('es-CO', { maximumFractionDigits: 1 })} <small>${hours === 1 ? 'hora' : 'horas'}</small>`;
  capacity.style.setProperty('--progress', `${((wattHours - Number(capacity.min)) / (Number(capacity.max) - Number(capacity.min))) * 100}%`);
  load.style.setProperty('--progress', `${((watts - Number(load.min)) / (Number(load.max) - Number(load.min))) * 100}%`);

  if (watts <= 30) example.textContent = 'Por ejemplo, una lámpara LED y un teléfono.';
  else if (watts <= 100) example.textContent = 'Por ejemplo, varios dispositivos pequeños a la vez.';
  else if (watts <= 250) example.textContent = 'Por ejemplo, un equipo portátil o una nevera compacta.';
  else example.textContent = 'Una carga alta reduce rápidamente la autonomía disponible.';
}

capacity.addEventListener('input', updateEstimate);
load.addEventListener('input', updateEstimate);
updateEstimate();
