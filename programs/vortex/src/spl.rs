use anchor_lang::prelude::*;
use light_hasher::{Hasher, Poseidon};

use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

use crate::{tree::Tree, ErrorCode, ADMIN, TREE_DEPTH};

#[derive(Accounts)]
#[instruction(deposit_amount: u64)]
pub struct InitializeSpl<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    pub mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = admin,
        seeds = [b"tree", deposit_amount.to_le_bytes().as_ref(), mint.key().as_ref()],
        bump,
        space = 8 + std::mem::size_of::<Tree>(),
    )]
    pub tree: AccountLoader<'info, Tree>,

    #[account(
        init,
        payer = admin,
        seeds = [b"pool", deposit_amount.to_le_bytes().as_ref(), mint.key().as_ref()],
        bump,
        space = 8 + SplPool::INIT_SPACE
    )]
    pub pool: Account<'info, SplPool>,

    #[account(
        init,
        payer = admin,
        associated_token::mint = mint,
        associated_token::authority = pool,
        associated_token::token_program = token_program,
    )]
    pub pool_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct SplPool {
    pub deposit_amount: u64,
    pub mint_address: Pubkey,
    pub bump: u8,
}

pub fn initialize_spl(ctx: Context<InitializeSpl>, deposit_amount: u64) -> Result<()> {
    require_keys_eq!(ctx.accounts.admin.key(), ADMIN, ErrorCode::InvalidAdmin);

    let tree = &mut ctx.accounts.tree.load_init()?;
    tree.next_index = 0;
    tree.bump = ctx.bumps.tree;
    tree.root_history_index = 0;

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
    ctx.accounts.pool.mint_address = ctx.accounts.mint.key();

    Ok(())
}
