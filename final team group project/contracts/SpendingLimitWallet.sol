// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title SpendingLimitWallet
/// @notice Parent links child wallets, sets rules, and children pay merchants within limits.
contract SpendingLimitWallet {
    struct Limits {
        uint256 perTx;   // single transaction max (wei); 0 = unlimited
        uint256 daily;   // daily cap (wei); 0 = unlimited
    }

    struct SpendWindow {
        uint256 dayIndex; // floor(block.timestamp / 1 days)
        uint256 spent;    // spent today (wei)
    }

    struct TempLimit {
        uint256 remaining; // remaining temp allowance (wei)
        uint256 expires;   // unix timestamp
    }

    //  State
    mapping(address => address) public parentOf;          // child -> parent
    mapping(address => bool)    public isChild;           // fast check
    mapping(address => Limits)  public limitsOf;          // child -> limits
    mapping(address => SpendWindow) private spendOf;      // child -> daily spend window
    mapping(address => bool)    public frozen;            // child -> frozen
    mapping(address => TempLimit) public tempOf;          // child -> temp limit
    mapping(address => mapping(address => bool)) public merchantWhitelist; // parent -> merchant -> allowed

    //  Events
    event ChildAdded(address indexed parent, address indexed child);
    event LimitsUpdated(address indexed parent, address indexed child, uint256 perTx, uint256 daily);
    event MerchantWhitelistUpdated(address indexed parent, address indexed merchant, bool allowed);
    event Frozen(address indexed parent, address indexed child, bool isFrozen);
    event TempRequested(address indexed child, uint256 amount);
    event TempApproved(address indexed parent, address indexed child, uint256 amount, uint256 expires);
    event Payment(address indexed child, address indexed merchant, uint256 amount);

    //  Modifiers
    modifier onlyParent(address child) {
        require(parentOf[child] == msg.sender, "Not parent");
        _;
    }

    modifier onlyChild() {
        require(isChild[msg.sender], "Not child");
        _;
    }

    //  Parent actions

    /// Link a child wallet to msg.sender (parent).
    function addChild(address child) external {
        require(child != address(0), "Zero addr");
        require(parentOf[child] == address(0), "Already linked");
        parentOf[child] = msg.sender;
        isChild[child] = true;
        emit ChildAdded(msg.sender, child);
    }

    /// Set spending limits for a child.
    function setLimits(address child, uint256 perTx, uint256 daily) external onlyParent(child) {
        limitsOf[child] = Limits({perTx: perTx, daily: daily});
        emit LimitsUpdated(msg.sender, child, perTx, daily);
    }

    /// Toggle merchant whitelist by parent.
    function setMerchant(address merchant, bool allowed) external {
        merchantWhitelist[msg.sender][merchant] = allowed;
        emit MerchantWhitelistUpdated(msg.sender, merchant, allowed);
    }

    /// Freeze/unfreeze a child.
    function setFrozen(address child, bool isFrozen) external onlyParent(child) {
        frozen[child] = isFrozen;
        emit Frozen(msg.sender, child, isFrozen);
    }
    function getFrozen(address child) external view returns(bool){
        return frozen[child];
    }
    /// Approve a temporary allowance for child.
    function approveTemp(address child, uint256 amount, uint256 validSeconds) external onlyParent(child) {
        tempOf[child] = TempLimit({
            remaining: amount,
            expires: block.timestamp + validSeconds
        });
        emit TempApproved(msg.sender, child, amount, block.timestamp + validSeconds);
    }

    //  Child actions

    /// Child requests a temporary limit.
    function requestTempLimit(uint256 amount) external onlyChild {
        emit TempRequested(msg.sender, amount);
    }

    /// Child pays a merchant in ETH subject to rules.
    function pay(address merchant) external payable onlyChild {
        require(!frozen[msg.sender], "Child frozen");
        address parent = parentOf[msg.sender];
        require(merchantWhitelist[parent][merchant], "Merchant not whitelisted");

        uint256 amount = msg.value;
        Limits memory L = limitsOf[msg.sender];

        // Per-transaction check with temp override
        if (L.perTx != 0 && amount > L.perTx) {
            TempLimit storage t = tempOf[msg.sender];
            require(block.timestamp <= t.expires && amount <= t.remaining, "Over perTx, no temp limit");
            t.remaining -= amount;
        }

        // Daily check
        if (L.daily != 0) {
            (uint256 spentToday,) = _spentToday(msg.sender);
            require(spentToday + amount <= L.daily, "Over daily");
        }

        _updateSpentToday(msg.sender, amount);

        (bool ok, ) = merchant.call{value: amount}("");
        require(ok, "Transfer failed");
        emit Payment(msg.sender, merchant, amount);
    }

    //  Views

    /// Returns (spentToday, dayIndex)
    function dailySpent(address child) external view returns (uint256, uint256) {
        return _spentToday(child);
    }

    //  Internals

    function _today() private view returns (uint256) {
        return block.timestamp / 1 days;
    }

    function _spentToday(address child) private view returns (uint256 spent, uint256 dayIdx) {
        SpendWindow storage w = spendOf[child];
        uint256 todayIdx = _today();
        spent = (w.dayIndex == todayIdx) ? w.spent : 0;
        dayIdx = todayIdx;
    }

    function _updateSpentToday(address child, uint256 add) private {
        SpendWindow storage w = spendOf[child];
        uint256 todayIdx = _today();
        if (w.dayIndex != todayIdx) {
            w.dayIndex = todayIdx;
            w.spent = 0;
        }
        w.spent += add;
    }
}
