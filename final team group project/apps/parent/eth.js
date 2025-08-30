// apps/parent/eth.js  — overwrite this entire file
let provider, signer, contract;

// Utilities
const $ = (id) => document.getElementById(id);
const msg = (e) => e?.data?.message || e?.error?.message || e?.message || String(e);

// Unified feedback
function showFeedback(id, text, type = "info") {
  const el = $(id);
  if (!el) return;
  el.innerHTML = `<div class="spinner"></div> ${text}`;
  el.className = `feedback ${type}`;
  el.style.display = "flex";
  if (type !== "info") setTimeout(() => (el.innerHTML = text), 400);
}

// Connect wallet & bind contract
async function connect() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask.");
      return;
    }
    await window.ethereum.request({ method: "eth_requestAccounts" });

    provider = new ethers.providers.Web3Provider(window.ethereum);
    const net = await provider.getNetwork();
    $("net").textContent = `${net.name || "localhost"} (${net.chainId})`;
    if (net.chainId !== 31337) {
      alert('Please switch MetaMask to "Localhost 8545" (chainId 31337).');
      return;
    }

    signer = provider.getSigner();
    $("addr").textContent = await signer.getAddress();

    // Load ABI and address (deploy.js has copied them to apps/parent/)
    const abi = await (await fetch("./abi.json", { cache: "no-store" })).json();
    const addrJson = await (await fetch("./contracts_address.json", { cache: "no-store" })).json();
    const address = addrJson.SpendingLimitWallet; // The key name must be SpendingLimitWallet
    contract = new ethers.Contract(address, abi, signer);
    console.log("Parent connected to", address);
  } catch (e) {
    console.error(e);
    alert(msg(e) || "Connect failed");
  }
}

// Events: refresh on account/network change
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}
document.getElementById("btnConnect")?.addEventListener("click", connect);

// — Implementations for feature buttons —

// Add child account
async function addChild() {
  const childAddr = $("childAddr").value.trim();
  if (!childAddr) return showFeedback("addChildFeedback", "Please enter a child address", "error");
  if (!contract)   return showFeedback("addChildFeedback", "Please connect wallet first", "error");

  showFeedback("addChildFeedback", "Processing transaction...", "info");
  try {
    const tx = await contract.addChild(childAddr);
    await tx.wait();
    showFeedback("addChildFeedback", "Child account added successfully!", "success");
  } catch (e) {
    console.error(e);
    showFeedback("addChildFeedback", `Error: ${msg(e)}`, "error");
  }
}

// Set limits (ETH -> Wei)
async function setLimit() {
  const childAddr = $("limitChild").value.trim();
  if (!childAddr) return showFeedback("setLimitsFeedback", "Please fill child address", "error");
  if (!contract)   return showFeedback("setLimitsFeedback", "Please connect wallet first", "error");

  let perTx, daily;
  try {
    perTx = ethers.utils.parseEther(($("perTx").value || "0").trim());
    daily = ethers.utils.parseEther(($("daily").value || "0").trim());
  } catch {
    return showFeedback("setLimitsFeedback", "Invalid ETH amount", "error");
  }

  showFeedback("setLimitsFeedback", "Processing transaction...", "info");
  try {
    const tx = await contract.setLimits(childAddr, perTx, daily);
    await tx.wait();
    showFeedback("setLimitsFeedback", "Spending limits updated successfully!", "success");
  } catch (e) {
    console.error(e);
    showFeedback("setLimitsFeedback", `Error: ${msg(e)}`, "error");
  }
}

// Add merchant (whitelist)
async function addMerchant() {
  const merchantAddr = document.getElementById('merchant').value.trim();
  if (!merchantAddr) return showFeedback('merchantFeedback', 'Please enter a merchant address', 'error');
  if (!contract)     return showFeedback('merchantFeedback', 'Please connect wallet first', 'error');

  showFeedback('merchantFeedback', 'Adding merchant to whitelist...', 'info');
  try {
    const tx = await contract.setMerchant(merchantAddr, true);
    await tx.wait();
    showFeedback('merchantFeedback', '✅ Merchant added to whitelist', 'success');
  } catch (e) {
    const m = e?.data?.message || e?.error?.message || e?.message || 'Add failed';
    showFeedback('merchantFeedback', `Error: ${m}`, 'error');
  }
}

// Remove merchant (un-whitelist)
async function removeMerchant() {
  const merchantAddr = document.getElementById('merchant').value.trim();
  if (!merchantAddr) return showFeedback('merchantFeedback', 'Please enter a merchant address', 'error');
  if (!contract)     return showFeedback('merchantFeedback', 'Please connect wallet first', 'error');

  showFeedback('merchantFeedback', 'Removing merchant from whitelist...', 'info');
  try {
    const tx = await contract.setMerchant(merchantAddr, false);
    await tx.wait();
    showFeedback('merchantFeedback', '🗑️ Merchant removed from whitelist', 'success');
  } catch (e) {
    const m = e?.data?.message || e?.error?.message || e?.message || 'Remove failed';
    showFeedback('merchantFeedback', `Error: ${m}`, 'error');
  }
}

// Check whitelist status
async function checkMerchant() {
  if (!contract) return showFeedback('merchantFeedback', 'Please connect wallet first', 'error');
  const merchantAddr = document.getElementById('merchant').value.trim();
  if (!merchantAddr) return showFeedback('merchantFeedback', 'Please enter a merchant address', 'error');

  try {
    const parentAddr = await signer.getAddress();
    const allowed = await contract.merchantWhitelist(parentAddr, merchantAddr);
    showFeedback('merchantFeedback', allowed ? '✅ Whitelisted' : '❌ Not whitelisted', allowed ? 'success' : 'warning');
  } catch (e) {
    const m = e?.data?.message || e?.error?.message || e?.message || 'Check failed';
    showFeedback('merchantFeedback', `Error: ${m}`, 'error');
  }
}


// Freeze / Unfreeze (true = freeze, false = unfreeze)
async function freezeChild(isFrozen) {
  const childAddr = $("freezeChild").value.trim();
  if (!childAddr) return showFeedback("freezeFeedback", "Please enter a child address", "error");
  if (!contract)   return showFeedback("freezeFeedback", "Please connect wallet first", "error");

  showFeedback("freezeFeedback", isFrozen ? "Freezing..." : "Unfreezing...", "info");
  try {
    const tx = await contract.setFrozen(childAddr, isFrozen);
    await tx.wait();
    showFeedback("freezeFeedback", `Account ${isFrozen ? "frozen" : "unfrozen"} successfully!`, "success");
  } catch (e) {
    console.error(e);
    showFeedback("freezeFeedback", `Error: ${msg(e)}`, "error");
  }
}

// Query freeze status
async function checkFrozen() {
  const childAddr = $("freezeChild").value.trim();
  if (!childAddr) return showFeedback("freezeFeedback", "Please enter a child address", "error");
  if (!contract)   return showFeedback("freezeFeedback", "Please connect wallet first", "error");

  try {
    const status = await contract.getFrozen(childAddr);
    showFeedback("freezeFeedback", `Current status: ${status ? "Frozen" : "Unfrozen"}`, "info");
  } catch (e) {
    console.error(e);
    showFeedback("freezeFeedback", `Error: ${msg(e)}`, "error");
  }
}

// Approve temporary limit
async function approveTemp() {
  const childAddr = $("tempChild").value.trim();
  const secsRaw   = $("tempSecs").value.trim();
  let amount;
  try {
    amount = ethers.utils.parseEther(($("tempAmount").value || "0").trim());
  } catch {
    return showFeedback("tempFeedback", "Invalid ETH amount", "error");
  }
  const validSeconds = parseInt(secsRaw || "0", 10);

  if (!childAddr || validSeconds <= 0) {
    return showFeedback("tempFeedback", "Please fill child address and valid seconds", "error");
  }
  if (!contract) {
    return showFeedback("tempFeedback", "Please connect wallet first", "error");
  }

  showFeedback("tempFeedback", "Processing transaction...", "info");
  try {
    const tx = await contract.approveTemp(childAddr, amount, validSeconds);
    await tx.wait();
    showFeedback("tempFeedback", "Temporary limit approved successfully!", "success");
  } catch (e) {
    console.error(e);
    showFeedback("tempFeedback", `Error: ${msg(e)}`, "error");
  }
}

// Expose to window so HTML onclick can call directly
window.connect = connect;
window.addChild = addChild;
window.setLimit = setLimit;
window.setMerchant = setMerchant;
window.freezeChild = freezeChild;     // freezeChild(true/false)
window.checkFrozen = checkFrozen;     // New: query status
window.approveTemp = approveTemp;
window.addMerchant = addMerchant;
window.removeMerchant = removeMerchant;
window.checkMerchant = checkMerchant;
