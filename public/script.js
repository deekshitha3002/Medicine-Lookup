async function search() {
  const name = document.getElementById('medInput').value.trim();
  const resultDiv = document.getElementById('result');
  if (!name) return;

  resultDiv.innerHTML = "<p>Searching...</p>";

  try {
    const res = await fetch(`/api/medicine/${encodeURIComponent(name)}`);
    const data = await res.json();

    if (!data.found) {
      resultDiv.innerHTML = `<p class="not-found">❌ No information found for "${name}". Try checking the spelling or search the generic name.</p>`;
      return;
    }

    const sourceBadge = data.source === 'FDA'
      ? `<span class="badge fda">✅ US FDA Verified</span>`
      : `<span class="badge ai">⚠️ AI-Generated — Not Officially Verified</span>`;

    const sideEffectsNote = data.sideEffectsSupplemented
      ? ` <span class="badge supplemented">AI-supplemented</span>`
      : '';

    resultDiv.innerHTML = `
      <h3>${data.name} (${data.genericName})</h3>
      ${sourceBadge}
      <p><strong>Purpose:</strong> ${data.purpose}</p>
      <p><strong>Prescription needed:</strong> ${data.isPrescription ? 'Yes' : 'No / OTC'}</p>
      <p><strong>Side Effects:</strong> ${data.sideEffects}${sideEffectsNote}</p>
      <p><strong>Warnings:</strong> ${data.warnings}</p>
    `;
  } catch (err) {
    resultDiv.innerHTML = "<p>Something went wrong. Please try again.</p>";
  }
}