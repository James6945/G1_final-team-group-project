// ===== v5 version =====
let provider, signer, vault;

const $  = (id) => document.getElementById(id);
const log = (s) => { const el = $('log'); el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; };

function toTsLocal(dtStr){
  if(!dtStr) return 0;
  const t = new Date(dtStr);
  return Math.floor(t.getTime()/1000);
}

async function loadMeta() {
  // Try current directory first, then fallback to ../child in case files weren’t synced
  const abi = await (await fetch('./abi.json', {cache:'no-store'})).json();
  let addrJson;
  try {
    addrJson = await (await fetch('./contracts_address.json', {cache:'no-store'})).json();
  } catch {
    addrJson = await (await fetch('../child/contracts_address.json', {cache:'no-store'})).json();
  }
  // Requires {"SavingsVault":"0x..."}
  const addr = addrJson.SavingsVault;
  if (!addr || !ethers.utils.isAddress(addr)) throw new Error('Valid "SavingsVault" not found in contracts_address.json');
  return { abi, addr };
}

async function connect(){
  try{
    if(!window.ethereum){ alert('Please install MetaMask first'); return; }
    await ethereum.request({ method:'eth_requestAccounts' });

    provider = new ethers.providers.Web3Provider(window.ethereum);   // v5
    signer   = provider.getSigner();

    const who = await signer.getAddress();
    const net = await provider.getNetwork();
    $('who').textContent = `Connected: ${who} / Network: ${net.chainId}`;

    const { abi, addr } = await loadMeta();
    vault = new ethers.Contract(addr, abi, signer);
    log('✅ SavingsVault: ' + addr);
  }catch(e){
    console.error(e);
    log('❌ Connection failed: ' + (e?.message || e));
  }
}

// Parent deposit
async function depositFor(){
  try{
    if(!vault) return log('❗Please connect wallet first');
    const child = $('child').value.trim();
    const amount = $('amount').value.trim();
    const unlockAt = toTsLocal($('unlock').value);

    if(!ethers.utils.isAddress(child)) return log('❗Invalid child address');
    if(!amount) return log('❗Please enter an amount');
    if(!unlockAt) return log('❗Please select an unlock time');

    const tx = await vault.depositFor(child, unlockAt, { value: ethers.utils.parseEther(amount) });
    log('⏳ depositFor... ' + tx.hash);
    await tx.wait();
    log('✅ depositFor done');
  }catch(e){
    console.error(e);
    log('❌ depositFor failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Parent early release
async function releaseToChild(){
  try{
    if(!vault) return log('❗Please connect wallet first');
    const child = $('child').value.trim();
    if(!ethers.utils.isAddress(child)) return log('❗Invalid child address');

    const tx = await vault.releaseToChild(child);
    log('⏳ releaseToChild... ' + tx.hash);
    await tx.wait();
    log('✅ releaseToChild done');
  }catch(e){
    console.error(e);
    log('❌ releaseToChild failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Child self-withdraw (current account must be the child)
async function childWithdraw(){
  try{
    if(!vault) return log('❗Please connect wallet first');
    const tx = await vault.childWithdraw();
    log('⏳ childWithdraw... ' + tx.hash);
    await tx.wait();
    log('✅ childWithdraw done');
  }catch(e){
    console.error(e);
    log('❌ childWithdraw failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Query
async function checkBalance(){
  try{
    if(!vault) return log('❗Please connect wallet first');
    const addr = $('childQ').value.trim();
    if(!ethers.utils.isAddress(addr)) return log('❗Invalid address');

    const bal = await vault.balanceOf(addr);
    const ts  = await vault.unlockAt(addr);
    const date = ts.eq(0) ? '-' : new Date(ts.toNumber()*1000).toLocaleString();

    $('queryOut').textContent = `balance=${ethers.utils.formatEther(bal)} ETH, unlockAt=${date}`;
    log(`ℹ️ balance=${ethers.utils.formatEther(bal)} ETH, unlockAt=${date}`);
  }catch(e){
    console.error(e);
    log('❌ query failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Expose for inline buttons
window.connect = connect;
window.depositFor = depositFor;
window.releaseToChild = releaseToChild;
window.childWithdraw = childWithdraw;
window.checkBalance = checkBalance;
