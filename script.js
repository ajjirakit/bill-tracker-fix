const RATE = 15;
const DAILY_DEDUCTION = 25;
const $ = (id) => document.getElementById(id);
let records = [];
let editingDate = null;
let apiUrl = localStorage.getItem("billTrackerApiUrl") || "";
let localMode = localStorage.getItem("billTrackerLocalMode") === "true";

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}
function monthISO(date = todayISO()) { return date.slice(0, 7); }
function money(n) { return Number(n || 0).toLocaleString("th-TH", {minimumFractionDigits: 2, maximumFractionDigits: 2}); }
function calculate(total) {
  const bills = Math.max(0, Math.floor(Number(total) || 0));
  const netBills = Math.max(0, bills - DAILY_DEDUCTION);
  return { totalBills: bills, deduction: DAILY_DEDUCTION, netBills, grossMoney: bills * RATE, netMoney: netBills * RATE };
}
function normalizeRecord(r) {
  const c = calculate(r.totalBills);
  return { date: String(r.date), ...c };
}
function setStatus(text) { $("syncStatus").textContent = text; }

function updatePreview() {
  const c = calculate($("totalBills").value);
  $("netBillsPreview").textContent = `${c.netBills.toLocaleString("th-TH")} บิล`;
  $("grossMoneyPreview").textContent = `${money(c.grossMoney)} บาท`;
  $("netMoneyPreview").textContent = `${money(c.netMoney)} บาท`;
}
function selectedMonthRecords() {
  const month = $("monthFilter").value;
  return records.filter(r => r.date.startsWith(month)).sort((a,b) => b.date.localeCompare(a.date));
}
function render() {
  const monthRecords = selectedMonthRecords();
  const sum = monthRecords.reduce((a, r) => ({
    totalBills: a.totalBills + r.totalBills,
    netBills: a.netBills + r.netBills,
    grossMoney: a.grossMoney + r.grossMoney,
    netMoney: a.netMoney + r.netMoney
  }), {totalBills:0, netBills:0, grossMoney:0, netMoney:0});
  $("monthBills").textContent = sum.totalBills.toLocaleString("th-TH");
  $("monthNetBills").textContent = sum.netBills.toLocaleString("th-TH");
  $("monthGrossMoney").textContent = money(sum.grossMoney);
  $("monthNetMoney").textContent = money(sum.netMoney);
  const body = $("historyBody");
  if (!monthRecords.length) {
    const otherMonths = records.length > 0;
    body.innerHTML = `<tr><td colspan="7" class="empty">${otherMonths ? `ไม่มีข้อมูลในเดือน ${escapeHtml($("monthFilter").value)} แต่พบข้อมูล ${records.length} รายการในเดือนอื่น กรุณาเลือกเดือนที่ต้องการดู` : 'ยังไม่มีข้อมูลใน Google Sheets กรุณาบันทึกข้อมูลหรือกด “โหลดข้อมูลใหม่”'}</td></tr>`;
    return;
  }
  body.innerHTML = monthRecords.map(r => `<tr>
    <td>${escapeHtml(r.date)}</td>
    <td>${r.totalBills.toLocaleString("th-TH")}</td>
    <td>${r.deduction.toLocaleString("th-TH")}</td>
    <td>${r.netBills.toLocaleString("th-TH")}</td>
    <td>${money(r.grossMoney)}</td>
    <td><strong>${money(r.netMoney)}</strong></td>
    <td><div class="table-actions">
      <button class="secondary small-btn" data-edit="${escapeHtml(r.date)}">แก้ไข</button>
      <button class="small-btn delete-btn" data-delete="${escapeHtml(r.date)}">ลบ</button>
    </div></td>
  </tr>`).join("");
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
async function request(action, payload = {}) {
  if (localMode) {
    if (action === "list") return JSON.parse(localStorage.getItem("billTrackerRecords") || "[]");
    if (action === "upsert") {
      const all = JSON.parse(localStorage.getItem("billTrackerRecords") || "[]");
      const next = all.filter(r => r.date !== payload.date);
      next.push(normalizeRecord(payload));
      localStorage.setItem("billTrackerRecords", JSON.stringify(next));
      return {success:true};
    }
    if (action === "delete") {
      const all = JSON.parse(localStorage.getItem("billTrackerRecords") || "[]").filter(r => r.date !== payload.date);
      localStorage.setItem("billTrackerRecords", JSON.stringify(all));
      return {success:true};
    }
  }
  if (!apiUrl) throw new Error("กรุณาตั้งค่า Google Apps Script Web App URL ก่อน");
  // ใช้ JSONP เพื่อให้เว็บที่เปิดจาก Live Server เรียก Apps Script ข้ามโดเมนได้
  const callbackName = "billTrackerCallback_" + Date.now() + "_" + Math.floor(Math.random()*100000);
  const params = new URLSearchParams({action, ...payload, callback:callbackName});
  const data = await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("หมดเวลารอการตอบกลับ ตรวจสอบ URL และการเผยแพร่ Web App"));
    }, 15000);
    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    window[callbackName] = (result) => {
      cleanup();
      resolve(result);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("เรียก Google Apps Script ไม่สำเร็จ กรุณาตรวจสอบ URL และสิทธิ์การเข้าถึง"));
    };
    script.src = `${apiUrl}?${params.toString()}`;
    document.body.appendChild(script);
  });
  if (data.success === false) throw new Error(data.error || "เกิดข้อผิดพลาด");
  return data;
}
async function loadRecords() {
  setStatus("กำลังโหลด...");
  try {
    const data = await request("list");
    if (data && data.success === false) throw new Error(data.error || "Google Apps Script ส่งข้อผิดพลาดกลับมา");
    records = (Array.isArray(data) ? data : (data.records || [])).map(normalizeRecord).filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.date));
    setStatus(localMode ? "โหมดทดลองในเครื่อง" : "เชื่อมต่อ Google Sheets แล้ว");
    render();
  } catch (err) {
    setStatus("เชื่อมต่อไม่สำเร็จ");
    $("historyBody").innerHTML = `<tr><td colspan="7" class="empty">${escapeHtml(err.message)} — ตรวจสอบ URL และการเผยแพร่ Web App</td></tr>`;
  }
}
function resetForm() {
  editingDate = null;
  $("billDate").value = todayISO();
  $("totalBills").value = "";
  $("saveButton").textContent = "บันทึกข้อมูล";
  updatePreview();
}
$("billDate").value = todayISO();
$("monthFilter").value = monthISO();
$("apiUrl").value = apiUrl;
$("totalBills").addEventListener("input", updatePreview);
$("monthFilter").addEventListener("change", render);
$("resetButton").addEventListener("click", resetForm);
$("refreshButton").addEventListener("click", loadRecords);
$("localModeButton").addEventListener("click", async () => {
  localMode = true;
  localStorage.setItem("billTrackerLocalMode", "true");
  setStatus("โหมดทดลองในเครื่อง");
  await loadRecords();
});
$("connectButton").addEventListener("click", async () => {
  const value = $("apiUrl").value.trim();
  if (!value.startsWith("https://script.google.com/")) {
    alert("กรุณาวาง URL Web App ที่ขึ้นต้นด้วย https://script.google.com/");
    return;
  }
  apiUrl = value;
  localMode = false;
  localStorage.setItem("billTrackerApiUrl", apiUrl);
  localStorage.setItem("billTrackerLocalMode", "false");
  await loadRecords();
});
$("billForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const date = $("billDate").value;
  const total = $("totalBills").value;
  if (!date || total === "" || Number(total) < 0 || !Number.isInteger(Number(total))) {
    alert("กรุณากรอกวันที่และจำนวนบิลเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
    return;
  }
  const existing = records.find(r => r.date === date);
  if (existing && editingDate !== date && !confirm("วันที่นี้มีข้อมูลแล้ว หากบันทึกจะเขียนทับข้อมูลเดิม ต้องการดำเนินการต่อหรือไม่?")) return;
  $("saveButton").disabled = true;
  try {
    await request("upsert", {date, totalBills:String(total)});
    $("monthFilter").value = monthISO(date);
    await loadRecords();
    resetForm();
    alert("บันทึกข้อมูลเรียบร้อย");
  } catch (err) { alert(`บันทึกไม่สำเร็จ: ${err.message}`); }
  finally { $("saveButton").disabled = false; }
});
$("historyBody").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  if (editButton) {
    const record = records.find(r => r.date === editButton.dataset.edit);
    if (!record) return;
    editingDate = record.date;
    $("billDate").value = record.date;
    $("totalBills").value = record.totalBills;
    $("saveButton").textContent = "บันทึกการแก้ไข";
    updatePreview();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  if (deleteButton) {
    const date = deleteButton.dataset.delete;
    if (!confirm(`ต้องการลบข้อมูลวันที่ ${date} ใช่หรือไม่?`)) return;
    try {
      await request("delete", {date});
      await loadRecords();
      if (editingDate === date) resetForm();
    } catch (err) { alert(`ลบไม่สำเร็จ: ${err.message}`); }
  }
});
$("exportButton").addEventListener("click", () => {
  const list = selectedMonthRecords();
  const rows = [["วันที่","บิลทั้งหมด","หักบิล","บิลสุทธิ","เงินก่อนหัก (บาท)","เงินหลังหัก (บาท)"]];
  list.forEach(r => rows.push([r.date,r.totalBills,r.deduction,r.netBills,r.grossMoney,r.netMoney]));
  const csv = "\uFEFF" + rows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob([csv], {type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `bill-record-${$("monthFilter").value}.csv`; a.click();
  URL.revokeObjectURL(url);
});
updatePreview();
loadRecords();
