let provider, signer, vault;

const $ = (id)=>document.getElementById(id);
const log = (s)=>{
  const el=$('log');
  el.textContent += s + '\n';
  el.scrollTop = el.scrollHeight;
};

function setDisabled(disabled=true) {
  // Inline buttons no longer rely on id bindings; this can be removed or left empty
}

// Connect wallet
async function connect() {
  try {
    if (!window.ethereum) return alert('Please install MetaMask first');
    await ethereum.request({ method: 'eth_requestAccounts' });
    provider = new ethers.providers.Web3Provider(window.ethereum);
    signer = provider.getSigner();

    const net = await provider.getNetwork();
    $('who').textContent = `Connected: ${await signer.getAddress()}  /  Network: ${net.chainId}`;
    if (net.chainId !== 31337) {
      log('⚠️ Please switch MetaMask to Localhost 8545 (chainId 31337)');
    }

    // Load ABI & address
    let abi, addrJson;
    try {
      abi = await (await fetch('./abi.json', {cache:'no-store'})).json();
    } catch (e) {
      log('❗abi.json not found in apps/savings/');
      throw e;
    }
    try {
      addrJson = await (await fetch('./contracts_address.json', {cache:'no-store'})).json();
    } catch {
      log('ℹ️ contracts_address.json not found in apps/savings/, trying ../child/');
      addrJson = await (await fetch('../child/contracts_address.json', {cache:'no-store'})).json();
    }

    if (!addrJson || !addrJson.SavingsVault) {
      log('❗Field "SavingsVault" not found in contracts_address.json. Example: { "SavingsVault": "0x..." }');
      return;
    }
    const addr = addrJson.SavingsVault;
    if (!ethers.utils.isAddress(addr)) {
      log('❗Invalid SavingsVault address: ' + addr);
      return;
    }

    vault = new ethers.Contract(addr, abi, signer);
    log('✅ SavingsVault: ' + addr);

  } catch (e) {
    console.error(e);
    log('❌ Connection failed: ' + (e?.message || e));
  }
}

function toTsLocal(dtStr){
  if(!dtStr) return 0;
  const t = new Date(dtStr);
  return Math.floor(t.getTime()/1000);
}

// Parent deposit
async function depositFor(){
  if(!vault) return log('❗Not connected or contract not found');
  const child = $('child').value.trim();
  const amount = $('amount').value.trim();
  const unlockAt = toTsLocal($('unlock').value);

  if(!ethers.utils.isAddress(child)) return log('❗Invalid child address');
  if(!amount) return log('❗Please enter amount');
  if(!unlockAt) return log('❗Please select an unlock time');

  try{
    const tx = await vault.depositFor(child, unlockAt, { value: ethers.utils.parseEther(amount) });
    log('⏳ depositFor... ' + tx.hash);
    await tx.wait();
    log('✅ depositFor done');
  }catch(e){
    console.error(e); log('❌ depositFor failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Parent early release
async function releaseToChild(){
  if(!vault) return log('❗Not connected or contract not found');
  const child = $('child').value.trim();
  if(!ethers.utils.isAddress(child)) return log('❗Invalid child address');
  try{
    const tx = await vault.releaseToChild(child);
    log('⏳ releaseToChild... ' + tx.hash);
    await tx.wait();
    log('✅ releaseToChild done');
  }catch(e){
    console.error(e); log('❌ releaseToChild failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Child self-withdraw on unlock
async function childWithdraw(){
  if(!vault) return log('❗Not connected or contract not found');
  try{
    const tx = await vault.childWithdraw();
    log('⏳ childWithdraw... ' + tx.hash);
    await tx.wait();
    log('✅ childWithdraw done');
  }catch(e){
    console.error(e); log('❌ childWithdraw failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Query
async function checkBalance(){
  if(!vault) return log('❗Not connected or contract not found');
  const addr = $('childQ').value.trim();
  if(!ethers.utils.isAddress(addr)) return log('❗Invalid address');
  try{
    const bal = await vault.balanceOf(addr);
    const ts  = await vault.unlockAt(addr);
    const date = ts.eq(0) ? '-' : new Date(ts.toNumber()*1000).toLocaleString();
    log(`ℹ️ child=${addr}
balance=${ethers.utils.formatEther(bal)} ETH
unlockAt=${date}`);
  }catch(e){
    console.error(e); log('❌ query failed: ' + (e?.data?.message || e?.message || e));
  }
}

// Keep only global mounts
window.connect = connect;
window.depositFor = depositFor;
window.releaseToChild = releaseToChild;
window.childWithdraw = childWithdraw;
window.checkBalance = checkBalance;
