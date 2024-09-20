// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";

contract SmartAccount is IAccount, UUPSUpgradeable, ERC1155Holder, Nonces, OwnableUpgradeable {
    IEntryPoint private immutable ENTRY_POINT;

    modifier onlyThis() {
        _requireThis();
        _;
    }

    modifier onlyEntryPoint() {
        _requireEntryPoint();
        _;
    }

    modifier onlyEntryPointOrOwner() {
        _requireEntryPointOrOwner();
        _;
    }

    error CallFailed(bytes result);
    error NotFromThis(address sender);
    error InvalidNonce(uint256 nonce);
    error NotFromEntryPoint(address sender);
    error NotFromEntryPointOrOwner(address sender);

    receive() external payable {}

    constructor(address entryPoint_) {
        ENTRY_POINT = IEntryPoint(entryPoint_);

        _disableInitializers();
    }

    function __SmartAccount_init(address owner_) external initializer {
        __Ownable_init(owner_);
    }

    function execute(
        address destination_,
        uint256 value_,
        bytes calldata functionData_
    ) external onlyEntryPointOrOwner {
        (bool success, bytes memory result) = destination_.call{value: value_}(functionData_);
        if (!success) {
            revert CallFailed(result);
        }
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external onlyEntryPoint returns (uint256 validationData) {
        validationData = _validateSignature(userOp, userOpHash);
        _validateAndUpdateNonce(userOp.nonce);
        _payPrefund(missingAccountFunds);
    }

    function validateSignature(
        bytes32 messageHash_,
        bytes memory signature_
    ) public view returns (bool) {
        return
            ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(messageHash_), signature_) ==
            owner();
    }

    function getCurrentNonce() public view virtual returns (uint256) {
        return nonces(address(this));
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == type(IAccount).interfaceId || super.supportsInterface(interfaceId);
    }

    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view returns (uint256 validationData) {
        bool proofResult_ = validateSignature(userOpHash, userOp.signature);

        if (!proofResult_) {
            return SIG_VALIDATION_FAILED;
        }

        return SIG_VALIDATION_SUCCESS;
    }

    function _payPrefund(uint256 missingAccountFunds_) internal {
        if (missingAccountFunds_ != 0) {
            (bool success, ) = payable(_msgSender()).call{
                value: missingAccountFunds_,
                gas: type(uint256).max
            }("");
            (success);
        }
    }

    function _validateAndUpdateNonce(uint256 nonce_) internal {
        if (_useNonce(address(this)) != nonce_) {
            revert InvalidNonce(nonce_);
        }
    }

    // solhint-disable-next-line no-empty-blocks
    function _authorizeUpgrade(address newImplementation) internal override onlyThis {}

    function implementation() external view returns (address) {
        return ERC1967Utils.getImplementation();
    }

    function _requireEntryPoint() internal view {
        if (_msgSender() != address(ENTRY_POINT)) {
            revert NotFromEntryPoint(_msgSender());
        }
    }

    function _requireEntryPointOrOwner() internal view {
        if (_msgSender() != address(ENTRY_POINT) && _msgSender() != owner()) {
            revert NotFromEntryPointOrOwner(_msgSender());
        }
    }

    function _requireThis() internal view {
        if (_msgSender() != address(this)) {
            revert NotFromThis(_msgSender());
        }
    }
}
