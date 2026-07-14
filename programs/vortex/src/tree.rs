use crate::{ErrorCode, TREE_DEPTH};
use anchor_lang::prelude::*;
use light_hasher::{Hasher, Poseidon};

#[account(zero_copy)]
pub struct Tree {
    pub root: [u8; 32],
    pub root_history: [[u8; 32]; 100],
    pub root_history_index: u32,
    pub filled_subtrees: [[u8; 32]; TREE_DEPTH],
    pub zeros: [[u8; 32]; TREE_DEPTH],
    pub next_index: u32,
    pub bump: u8,
    pub _padding: [u8; 3],
}

impl Tree {
    pub fn insert(&mut self, leaf: [u8; 32]) -> Result<u32> {
        require!(self.next_index < (1u32 << TREE_DEPTH), ErrorCode::TreeFull);

        let leaf_index = self.next_index;
        let mut current_index = leaf_index;
        let mut current_hash = leaf;

        for i in 0..TREE_DEPTH {
            let (left, right) = if current_index.is_multiple_of(2) {
                self.filled_subtrees[i] = current_hash;
                (current_hash, self.zeros[i])
            } else {
                (self.filled_subtrees[i], current_hash)
            };
            current_hash = hash_left_right(left, right)?;
            current_index /= 2;
        }

        self.root = current_hash;
        self.root_history[self.root_history_index as usize] = current_hash;
        self.root_history_index = (self.root_history_index + 1) % self.root_history.len() as u32;

        self.next_index += 1;

        Ok(leaf_index)
    }
}

pub fn hash_left_right(left: [u8; 32], right: [u8; 32]) -> Result<[u8; 32]> {
    Poseidon::hashv(&[&left, &right]).map_err(|_| error!(ErrorCode::HashError))
}

pub fn is_known_root(tree: &Tree, root: [u8; 32]) -> bool {
    if root == [0u8; 32] {
        return false;
    }
    tree.root_history.contains(&root)
}
