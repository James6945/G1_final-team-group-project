// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Read-only parent lookup from an existing SpendingLimitWallet; do not modify the old contract
interface ISpendingLimitWallet {
    function parentOf(address child) external view returns (address);
}

/// @title SavingsVault - Child “Savings Account / Vault”
/// @dev Design goals: minimally intrusive to the legacy system.
///      Parents deposit funds into a vault for the child and may set/update the unlock time;
///      upon maturity the child can self-withdraw; or the parent can release funds early to the child.
///      After receiving ETH, the child can continue to use your existing pay() flow constrained by limits/whitelist.
contract SavingsVault {
    ISpendingLimitWallet public immutable wallet;

    // child => vault balance
    mapping(address => uint256) public balanceOf;
    // child => unlock timestamp (seconds)
    mapping(address => uint64)  public unlockAt;

    // Simple reentrancy guard (no external library)
    bool private _entered;

    // Events
    event Deposited(address indexed parent, address indexed child, uint256 amount, uint64 unlockAt);
    event Released(address indexed child, uint256 amount); // sent to child
    event Withdrawn(address indexed parent, address indexed child, address to, uint256 amount); // parent withdraws (optional)
    event UnlockUpdated(address indexed parent, address indexed child, uint64 unlockAt);

    // Custom errors (gas efficient)
    error NotParent();
    error Locked();
    error Insufficient();
    error ZeroAddress();
    error ZeroAmount();

    constructor(address walletAddress) {
        if (walletAddress == address(0)) revert ZeroAddress();
        wallet = ISpendingLimitWallet(walletAddress);
    }

    modifier onlyParent(address child) {
        if (wallet.parentOf(child) != msg.sender) revert NotParent();
        _;
    }

    modifier nonReentrant() {
        require(!_entered, "REENTRANCY");
        _entered = true;
        _;
        _entered = false;
    }

    /// @notice Parent deposits for a child; can also set/extend the unlock time (only allows pushing it later)
    function depositFor(address child, uint64 newUnlockTs) external payable onlyParent(child) {
        if (child == address(0)) revert ZeroAddress();
        if (msg.value == 0) revert ZeroAmount();

        balanceOf[child] += msg.value;

        if (newUnlockTs > unlockAt[child]) {
            unlockAt[child] = newUnlockTs;
            emit UnlockUpdated(msg.sender, child, newUnlockTs);
        }

        emit Deposited(msg.sender, child, msg.value, unlockAt[child]);
    }

    /// @notice Parent can arbitrarily update the unlock time (business rules up to you; here both earlier/later are allowed)
    function setUnlockAt(address child, uint64 newUnlockTs) external onlyParent(child) {
        unlockAt[child] = newUnlockTs;
        emit UnlockUpdated(msg.sender, child, newUnlockTs);
    }

    /// @notice Parent releases funds to the child before maturity (child then spends under legacy contract’s limits)
    function releaseToChild(address child, uint256 amount) external onlyParent(child) nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[child]) revert Insufficient();

        balanceOf[child] -= amount;
        (bool ok, ) = payable(child).call{value: amount}("");
        require(ok, "TRANSFER_FAIL");
        emit Released(child, amount);
    }

    /// @notice Child self-withdraws after maturity
    function childWithdraw(uint256 amount) external nonReentrant {
        address child = msg.sender;
        if (block.timestamp < unlockAt[child]) revert Locked();
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[child]) revert Insufficient();

        balanceOf[child] -= amount;
        (bool ok, ) = payable(child).call{value: amount}("");
        require(ok, "TRANSFER_FAIL");
        emit Released(child, amount);
    }

    /// @notice (Optional) Parent withdraws to any address
    function parentWithdraw(address child, address to, uint256 amount) external onlyParent(child) nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (amount > balanceOf[child]) revert Insufficient();

        balanceOf[child] -= amount;
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "TRANSFER_FAIL");
        emit Withdrawn(msg.sender, child, to, amount);
    }

    // Reject direct payments to avoid “unassigned” funds that are not attributed to a child
    receive() external payable {
        revert("USE_depositFor");
    }

    fallback() external payable {
        revert("NO_FUNC");
    }
}
