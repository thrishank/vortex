use anchor_lang::prelude::*;
use anchor_lang::system_program;
use groth16_solana::groth16::Groth16Verifier;
use light_hasher::{Hasher, Poseidon};

use crate::tree::Tree;
use crate::verifying_key::VERIFYINGKEY;

declare_id!("6G3qPM3Rf4fmEgWRR8Mhv6822RJvrpuqf2aHB6QEzxe3");

// mod spl;
mod tree;
mod verifying_key;

pub const ADMIN: Pubkey = pubkey!("thrbabBvANwvKdV34GdrFUDXB6YMsksdfmiKj2ZUV3m");
pub const FEE_ACCOUNT: Pubkey = pubkey!("DoQ47WTYzvgCNXwVK1Uf3urpXqa8maE7hJFd1xNLYUp2");
pub const TREE_DEPTH: usize = 20;

pub const PROTOCOL_FEE: u64 = 1_000_000; // 0.001 SOL

#[program]
pub mod vortex {
    use crate::tree::is_known_root;

    use super::*;

    pub fn initialize(ctx: Context<Initialize>, deposit_amount: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.admin.key(), ADMIN, ErrorCode::InvalidAdmin);
        require!(
            deposit_amount == 1_000_000_000 || deposit_amount == 100_000_000,
            ErrorCode::InvalidAmount
        );

        let tree = &mut ctx.accounts.tree.load_init()?;
        tree.next_index = 0;
        tree.bump = ctx.bumps.tree;
        tree.root_history_index = 0;

        // Precompute the "zero hash" at every level of an empty tree, once,
        // at init time, instead of recomputing it on every single deposit.
        for i in 0..TREE_DEPTH {
            let zero_bytes = Poseidon::zero_bytes()[i];
            tree.zeros[i] = zero_bytes;
            tree.filled_subtrees[i] = zero_bytes;
        }
        tree.root_history = [[0u8; 32]; 100];

        let root = Poseidon::zero_bytes()[TREE_DEPTH];
        tree.root = root;
        tree.root_history[0] = root;

        ctx.accounts.pool.bump = ctx.bumps.pool;
        ctx.accounts.pool.deposit_amount = deposit_amount;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, commitment: [u8; 32]) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            ctx.accounts.pool.deposit_amount,
        )?;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.fee_account.to_account_info(),
                },
            ),
            PROTOCOL_FEE,
        )?;

        let leaf_index = ctx.accounts.tree.load_mut().unwrap().insert(commitment)?;

        emit!(DepositEvent {
            commitment,
            tree: ctx.accounts.tree.key(),
            leaf_index,
        });

        Ok(())
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        nullifier_hash: [u8; 32],
        root: [u8; 32],
        recipient: [u8; 32],
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
    ) -> Result<()> {
        require!(
            is_known_root(&ctx.accounts.tree.load_mut().unwrap(), root),
            ErrorCode::UnknownRoot
        );

        let public_inputs: &[[u8; 32]; 3] = &[root, nullifier_hash, recipient];

        let mut verifier =
            Groth16Verifier::new(&proof_a, &proof_b, &proof_c, public_inputs, &VERIFYINGKEY)
                .map_err(|_| error!(ErrorCode::InvalidProof))?;

        verifier
            .verify()
            .map_err(|_| error!(ErrorCode::ProofVerificationFailed))?;

        ctx.accounts.nullifier_account.nullifier_hash = nullifier_hash;

        let amount = ctx.accounts.pool.deposit_amount;

        **ctx
            .accounts
            .pool
            .to_account_info()
            .try_borrow_mut_lamports()? -= amount;

        **ctx
            .accounts
            .recipient
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        seeds = [b"tree", deposit_amount.to_le_bytes().as_ref()],
        bump,
        space = 8 + std::mem::size_of::<Tree>(),
    )]
    pub tree: AccountLoader<'info, Tree>,

    #[account(
        init,
        payer = admin,
        seeds = [b"pool", deposit_amount.to_le_bytes().as_ref()],
        bump,
        space = 8 + Pool::INIT_SPACE
    )]
    pub pool: Account<'info, Pool>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub deposit_amount: u64,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        address = FEE_ACCOUNT
    )]
    pub fee_account: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"tree", pool.deposit_amount.to_le_bytes().as_ref()],
        bump = tree.load()?.bump
    )]
    pub tree: AccountLoader<'info, Tree>,

    #[account(
        mut,
        seeds = [b"pool", pool.deposit_amount.to_le_bytes().as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nullifier_hash: [u8; 32])]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: only receives lamports, no data is read or written on it.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [b"tree", pool.deposit_amount.to_le_bytes().as_ref()],
        bump = tree.load()?.bump
    )]
    pub tree: AccountLoader<'info, Tree>,

    #[account(
        mut,
        seeds = [b"pool", pool.deposit_amount.to_le_bytes().as_ref()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = signer,
        space = 8 + 32,
        seeds = [b"nullifer", nullifier_hash.as_ref()],
        bump,
    )]
    pub nullifier_account: Account<'info, NullifierAccount>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct NullifierAccount {
    pub nullifier_hash: [u8; 32],
}

#[event]
pub struct DepositEvent {
    pub commitment: [u8; 32],
    pub tree: Pubkey,
    pub leaf_index: u32,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Admin is only allowed to call this instruction")]
    InvalidAdmin,

    #[msg("Invalid deposit amount, only 0.1 SOL and 1 SOL are allowed.")]
    InvalidAmount,

    #[msg("Invalid proof provided.")]
    InvalidProof,

    #[msg("Proof verification failed.")]
    ProofVerificationFailed,

    #[msg("Merkle tree is full.")]
    TreeFull,

    #[msg("Hashing error occurred.")]
    HashError,

    #[msg("The provided root is not known.")]
    UnknownRoot,
}
