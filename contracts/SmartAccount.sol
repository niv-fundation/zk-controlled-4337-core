// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Nonces} from "@openzeppelin/contracts/utils/Nonces.sol";
import {ERC1967Utils} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Utils.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ERC1155Holder} from "@openzeppelin/contracts/token/ERC1155/utils/ERC1155Holder.sol";

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {SIG_VALIDATION_FAILED, SIG_VALIDATION_SUCCESS} from "@account-abstraction/contracts/core/Helpers.sol";

import {Paginator} from "@solarity/solidity-lib/libs/arrays/Paginator.sol";
import {TypeCaster} from "@solarity/solidity-lib/libs/utils/TypeCaster.sol";
import {VerifierHelper} from "@solarity/solidity-lib/libs/zkp/snarkjs/VerifierHelper.sol";

contract SmartAccount is IAccount, Initializable, UUPSUpgradeable, ERC1155Holder, Nonces {
    using TypeCaster for *;
    using VerifierHelper for address;

    struct IdentityProof {
        VerifierHelper.ProofPoints identityProof;
    }

    struct TransactionLog {
        address destination;
        uint256 timestamp;
        uint256 value;
        bytes data;
    }

    IEntryPoint public immutable ENTRY_POINT;

    address public immutable IDENTITY_AUTH_VERIFIER;

    bytes32 public nullifier;

    TransactionLog[] public history;

    mapping(address => uint48) public sessionAccounts;

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

    event SessionAccountSet(address indexed account, uint256 timestamp);

    error InvalidProof();
    error CallFailed(bytes result);
    error NotFromThis(address sender);
    error InvalidNonce(uint256 nonce);
    error NotFromEntryPoint(address sender);
    error NotFromEntryPointOrOwner(address sender);

    receive() external payable {}

    constructor(address entryPoint_, address identityAuthVerifier_) {
        ENTRY_POINT = IEntryPoint(entryPoint_);

        IDENTITY_AUTH_VERIFIER = identityAuthVerifier_;

        _disableInitializers();
    }

    function __SmartAccount_init(bytes32 nullifier_) external initializer {
        nullifier = nullifier_;
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

    function setSessionAccount(address candidate_, bytes memory signature_) external {
        IdentityProof memory identityProof_ = decodeIdentityProof(signature_);

        bool proofResult_ = IDENTITY_AUTH_VERIFIER.verifyProofSafe(
            [uint256(nullifier), uint256(uint160(candidate_))].asDynamic(),
            identityProof_.identityProof,
            2
        );

        if (!proofResult_) {
            revert InvalidProof();
        }

        sessionAccounts[candidate_] = uint48(block.timestamp);

        emit SessionAccountSet(candidate_, block.timestamp);
    }

    function encodeIdentityProof(
        IdentityProof memory proof_
    ) external pure returns (bytes memory) {
        return abi.encode(proof_);
    }

    function decodeIdentityProof(bytes memory data_) public pure returns (IdentityProof memory) {
        return abi.decode(data_, (IdentityProof));
    }

    function getCurrentNonce() public view returns (uint256) {
        return nonces(address(this));
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == type(IAccount).interfaceId || super.supportsInterface(interfaceId);
    }

    function getTransactionHistory(
        uint256 offset_,
        uint256 limit_
    ) internal view returns (TransactionLog[] memory list_) {
        uint256 to_ = Paginator.getTo(history.length, offset_, limit_);

        list_ = new TransactionLog[](to_ - offset_);

        for (uint256 i = offset_; i < to_; i++) {
            list_[i - offset_] = history[i];
        }
    }

    function _validateSignature(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash
    ) internal view returns (uint256 validationData) {
        IdentityProof memory identityProof_ = decodeIdentityProof(userOp.signature);

        bool proofResult_ = IDENTITY_AUTH_VERIFIER.verifyProofSafe(
            [uint256(nullifier), uint256(userOpHash)].asDynamic(),
            identityProof_.identityProof,
            2
        );

        if (!proofResult_) {
            return SIG_VALIDATION_FAILED;
        }

        return SIG_VALIDATION_SUCCESS;
    }

    function _payPrefund(uint256 missingAccountFunds_) internal {
        if (missingAccountFunds_ != 0) {
            (bool success, ) = payable(msg.sender).call{
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
        if (msg.sender != address(ENTRY_POINT)) {
            revert NotFromEntryPoint(msg.sender);
        }
    }

    function _requireEntryPointOrOwner() internal view {
        if (msg.sender != address(ENTRY_POINT) && sessionAccounts[msg.sender] == 0) {
            revert NotFromEntryPointOrOwner(msg.sender);
        }
    }

    function _requireThis() internal view {
        if (msg.sender != address(this)) {
            revert NotFromThis(msg.sender);
        }
    }
}
