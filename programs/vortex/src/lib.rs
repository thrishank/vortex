use anchor_lang::prelude::*;
use anchor_lang::system_program;
use groth16_solana::groth16::Groth16Verifier;

use crate::verifying_key::VERIFYINGKEY;

declare_id!("7vhKNuB37GmurUQYBrT6SL2fX9Y3kCQgpANzbu1aCmjw");

mod verifying_key;

#[program]
pub mod vortex {
    use super::*;

    pub fn deposit(ctx: Context<Deposit>, commitment: [u8; 32]) -> Result<()> {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.signer.to_account_info(),
                    to: ctx.accounts.pool.to_account_info(),
                },
            ),
            1_000_000_000, // 1 SOL
        )?;

        emit!(DepositEvent {
            commitment,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn withdraw(
        _ctx: Context<Withdraw>,
        proof_a: [u8; 64],
        proof_b: [u8; 128],
        proof_c: [u8; 64],
        public_inputs: Vec<[u8; 32]>,
    ) -> Result<()> {
        let arr: &[[u8; 32]; 2] = public_inputs
            .as_slice()
            .try_into()
            .expect("expected exactly 2 public inputs");

        let mut verifier = Groth16Verifier::new(&proof_a, &proof_b, &proof_c, arr, &VERIFYINGKEY)
            .map_err(|_| error!(ErrorCode::InvalidProof))?;

        verifier
            .verify()
            .map_err(|_| error!(ErrorCode::ProofVerificationFailed))?;

        msg!("Groth16 proof verified successfully");

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    /// CHECK: WTF
    pub pool: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
}

#[event]
pub struct DepositEvent {
    pub commitment: [u8; 32],
    pub timestamp: i64,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid proof provided.")]
    InvalidProof,

    #[msg("Proof verification failed.")]
    ProofVerificationFailed,
}
