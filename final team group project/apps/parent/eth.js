let provider, signer, contract;

async function connect() {
  try {
    if (!window.ethereum) {
      alert('MetaMask not found. Please install MetaMask.');
      return;
    }

    // 1) 请求授权（必须由按钮点击触发）
    await window.ethereum.request({ method: 'eth_requestAccounts' });

    // 2) 绑定 provider/signer、显示网络信息
    provider = new ethers.providers.Web3Provider(window.ethereum);
    const net = await provider.getNetwork();
    document.getElementById('net').textContent = `${net.name} (${net.chainId})`;

    if (net.chainId !== 31337) {
      alert('Please switch MetaMask network to "Localhost 8545" (chainId 31337).');
      return;
    }

    // 3) 显示地址
    signer = provider.getSigner();
    const addr = await signer.getAddress();
    document.getElementById('addr').textContent = addr;

    // 4) 载入合约（确保 deploy.js 已把地址/ABI 拷贝到 apps/parent/）
    const abi = await (await fetch('./abi.json', { cache: 'no-store' })).json();
    const addrJson = await (await fetch('./contracts_address.json', { cache: 'no-store' })).json();
    const address = addrJson.SpendingLimitWallet;
    contract = new ethers.Contract(address, abi, signer);

    console.log('Contract ready at', address);
  } catch (err) {
    console.error(err);
    alert(err.message || 'Connect failed');
  }
}

// 事件监听：账号/网络变化后刷新
if (window.ethereum) {
  window.ethereum.on('accountsChanged', () => location.reload());
  window.ethereum.on('chainChanged', () => location.reload());
}

document.getElementById('btnConnect')?.addEventListener('click', connect);

// 添加子账户
    async function addChild() {
      const childAddr = document.getElementById('childAddr').value;
      if (!childAddr) {
        showFeedback('error', 'Please enter a child address', 'addChildFeedback');
        return;
      }
      showFeedback('info', 'Processing transaction...', 'addChildFeedback');
      try {
        // 实际代码应该调用合约
        const tx = await contract.addChild(childAddr);
        await tx.wait();
        console.log(tx)
        setTimeout(() => {
          showFeedback('success', 'Child account added successfully!', 'addChildFeedback');
        }, 2000);
      } catch (error) {
        showFeedback('error', `Error: Address error or the account already has a parent account`, 'addChildFeedback');
      }
    }
    
    // 设置限额
    async function setLimit() {
      const childAddr = document.getElementById('limitChild').value;
      const perTx = BigInt(Math.trunc(document.getElementById('perTx').value)) * 10n ** 18n;
      const daily = BigInt(Math.trunc(document.getElementById('daily').value)) * 10n ** 18n;
      
      if (!childAddr) {
        showFeedback('error', 'Please fill childAddr', 'setLimitsFeedback');
        return;
      }
      console.log(daily)
      showFeedback('info', 'Processing transaction...', 'setLimitsFeedback');
      try {
        const tx = await contract.setLimits(childAddr, perTx, daily);
        await tx.wait();
        console.log(tx)
        setTimeout(() => {
          showFeedback('success', 'Spending limits updated successfully!', 'setLimitsFeedback');
        }, 2000);
      } catch (error) {
        showFeedback('error', `Error: Restriction failed,Please Child check the address`, 'setLimitsFeedback');
      }
    }
    
    // 设置商家白名单
    async function setMerchant() {
      const merchantAddr = document.getElementById('merchant').value;
      const allowed = document.getElementById('allow').checked;
      if (!merchantAddr) {
        showFeedback('error', 'Please enter a merchant address', 'merchantFeedback');
        return;
      }
      showFeedback('info', 'Processing transaction...', 'merchantFeedback');
      try {
        const tx = await contract.setMerchant(merchantAddr, allowed);
        await tx.wait();
        setTimeout(() => {
          const status = allowed ? 'allowed' : 'blocked';
          showFeedback('success', `Merchant ${status} successfully!`, 'merchantFeedback');
        }, 2000);
      } catch (error) {
        showFeedback('error', `Error: Setup failed`, 'merchantFeedback');
      }
    }
    
    // 冻结/解冻子账户
    async function freezeChild() {
      const childAddr = document.getElementById('freezeChild').value;
      const isFrozen = document.getElementById('freezeFlag').checked;
      
      if (!childAddr) {
        showFeedback('error', 'Please enter a child address', 'freezeFeedback');
        return;
      }
      
      showFeedback('info', 'Processing transaction...', 'freezeFeedback');
      
      try {
        const tx = await contract.setFrozen(childAddr, isFrozen);
        await tx.wait();
        setTimeout(() => {
          const status = isFrozen ? 'frozen' : 'unfrozen';
          showFeedback('success', `Account ${status} successfully!`, 'freezeFeedback');
        }, 2000);
      } catch (error) {
        showFeedback('error', `Error: Freeze failed`, 'freezeFeedback');
      }
    }
    
    // 批准临时限额
    async function approveTemp() {
      const amount = BigInt(Math.trunc(document.getElementById('tempAmount').value)) * 10n ** 18n;
      const childAddr = document.getElementById('tempChild').value;
      const validSeconds = document.getElementById('tempSecs').value;
      
      if (!childAddr || !amount || !validSeconds) {
        showFeedback('error', 'Please fill all fields', 'tempFeedback');
        return;
      }
      
      showFeedback('info', 'Processing transaction...', 'tempFeedback');
      
      try {
        const tx = await contract.approveTemp(childAddr, amount, validSeconds);
        await tx.wait();
        setTimeout(() => {
          showFeedback('success', 'Temporary limit approved successfully!', 'tempFeedback');
          log(`Approved temporary limit for ${childAddr}: ${amount} ETH for ${validSeconds} seconds`);
        }, 2000);
      } catch (error) {
        showFeedback('error', `Error: Approval failed`, 'tempFeedback');
      }
    }
    
    // 显示反馈消息
    function showFeedback(type, message, elementId) {
      const element = document.getElementById(elementId);
      element.innerHTML = `<div class="spinner"></div> ${message}`;
      element.className = `feedback ${type}`;
      element.style.display = 'flex';
      if (type !== 'info') {
        setTimeout(() => {
          element.innerHTML = message;
        }, 500);
      }
    }
    
