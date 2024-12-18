// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import {TypeCaster} from "@solarity/solidity-lib/libs/utils/TypeCaster.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

import {SmartAccount} from "./SmartAccount.sol";

contract SmartAccountFactory is OwnableUpgradeable, UUPSUpgradeable {
    using TypeCaster for *;

    IEntryPoint public immutable ENTRY_POINT;

    mapping(bytes32 => address) public smartAccounts;

    address private _smartAccountImplementation;

    event SmartAccountDeployed(address indexed account);

    constructor(address entryPoint_) {
        ENTRY_POINT = IEntryPoint(entryPoint_);

        _disableInitializers();
    }

    function __SmartAccountFactory_init(address smartAccountImplementation_) external initializer {
        __Ownable_init(msg.sender);

        _smartAccountImplementation = smartAccountImplementation_;
    }

    function deploySmartAccount(bytes32 nullifier_) external returns (address) {
        SmartAccount account_ = SmartAccount(_deploy2(_smartAccountImplementation, nullifier_));

        account_.__SmartAccount_init(nullifier_);

        smartAccounts[nullifier_] = address(account_);

        emit SmartAccountDeployed(address(account_));

        return address(account_);
    }

    /**
     * @notice Sets the implementation address for the Smart Account contract.
     * Can only be called by the owner.
     */
    function setSmartAccountImplementation(address newImplementation) external onlyOwner {
        _smartAccountImplementation = newImplementation;
    }

    /**
     * @notice Returns the implementation address for the Smart Account contract.
     */
    function getSmartAccountImplementation() external view returns (address) {
        return _smartAccountImplementation;
    }

    /**
     * @notice Predicts the address of the Smart Account contract.
     */
    function predictSmartAccountAddress(bytes32 nullifier_) external view returns (address) {
        return _predictAddress(_smartAccountImplementation, nullifier_);
    }

    /**
     * Add a deposit for this paymaster, used for paying for transaction fees.
     */
    function deposit() public payable {
        ENTRY_POINT.depositTo{value: msg.value}(address(this));
    }

    /**
     * Withdraw value from the deposit.
     * @param withdrawAddress - Target to send to.
     * @param amount          - Amount to withdraw.
     */
    function withdrawTo(address payable withdrawAddress, uint256 amount) public onlyOwner {
        ENTRY_POINT.withdrawTo(withdrawAddress, amount);
    }

    /**
     * Add stake for this paymaster.
     * This method can also carry eth value to add to the current stake.
     * @param unstakeDelaySec - The unstake delay for this paymaster. Can only be increased.
     */
    function addStake(uint32 unstakeDelaySec) external payable onlyOwner {
        ENTRY_POINT.addStake{value: msg.value}(unstakeDelaySec);
    }

    /**
     * Return current paymaster's deposit on the entry point.
     */
    function getDeposit() public view returns (uint256) {
        return ENTRY_POINT.balanceOf(address(this));
    }

    /**
     * Unlock the stake, in order to withdraw it.
     * The paymaster can't serve requests once unlocked, until it calls addStake again
     */
    function unlockStake() external onlyOwner {
        ENTRY_POINT.unlockStake();
    }

    /**
     * Withdraw the entire paymaster's stake.
     * stake must be unlocked first (and then wait for the unstakeDelay to be over)
     * @param withdrawAddress - The address to send withdrawn value.
     */
    function withdrawStake(address payable withdrawAddress) external onlyOwner {
        ENTRY_POINT.withdrawStake(withdrawAddress);
    }

    /**
     * @notice Returns an implementation address for the Smart Account Factory contract.
     */
    function implementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    /**
     * @notice Returns the address of the Smart Account contract.
     */
    function getSmartAccount(bytes32 nullifier_) external view returns (address) {
        return smartAccounts[nullifier_];
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function _deploy2(address implementation_, bytes32 salt_) internal returns (address payable) {
        return payable(address(new ERC1967Proxy{salt: salt_}(implementation_, new bytes(0))));
    }

    function _predictAddress(
        address implementation_,
        bytes32 salt_
    ) internal view virtual returns (address) {
        bytes32 bytecodeHash = keccak256(
            abi.encodePacked(
                type(ERC1967Proxy).creationCode,
                abi.encode(implementation_, new bytes(0))
            )
        );

        return Create2.computeAddress(salt_, bytecodeHash);
    }
}
