// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";

import {TypeCaster} from "@solarity/solidity-lib/libs/utils/TypeCaster.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {SmartAccount} from "./SmartAccount.sol";

contract SmartAccountFactory is OwnableUpgradeable, UUPSUpgradeable {
    using TypeCaster for *;

    mapping(bytes32 => address) public smartAccounts;

    address private _smartAccountImplementation;

    event SmartAccountDeployed(address indexed account);

    constructor() {
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
