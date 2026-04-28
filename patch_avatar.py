import re

with open('public/game.js', 'r') as f:
    content = f.read()

# Fix the bug introduced in the last patch by restoring getAvatarSrc
replacement_getAvatar = """function getAvatarSrc(avatarData) {
    // Return custom avatar if available, otherwise return local soldier SVG
    return avatarData || `soldier.svg`;
}"""
content = re.sub(r'function getAvatarSrc.*?return \'soldier\.svg\';\n\}', replacement_getAvatar, content, flags=re.DOTALL)

# Fix the Tank constructor avatar logic
# Old:
#        if (isPlayer1) {
#            this.avatarImg.src = getAvatarSrc(gameState.avatar, false);
#        } else {
#            this.avatarImg.src = getAvatarSrc(gameState.opponentAvatar, true);
#        }
# OR: (if my reset hard worked)
#        if (isPlayer1) {
#            this.avatarImg.src = getAvatarSrc(gameState.avatar);
#        } else {
#            this.avatarImg.src = getAvatarSrc(gameState.opponentAvatar);
#        }

replacement_tank = """        // Setup Avatar Image
        this.avatarImg = new Image();
        if (isPlayer1) {
            // Left tank is always Player 1
            if (gameState.isPlayer1) {
                // I am Player 1, so the left tank is ME
                this.avatarImg.src = getAvatarSrc(gameState.avatar);
            } else {
                // I am Player 2, so the left tank is the OPPONENT
                this.avatarImg.src = getAvatarSrc(gameState.opponentAvatar);
            }
        } else {
            // Right tank is always Player 2
            if (gameState.isPlayer1) {
                // I am Player 1, so the right tank is the OPPONENT
                this.avatarImg.src = getAvatarSrc(gameState.opponentAvatar);
            } else {
                // I am Player 2, so the right tank is ME
                this.avatarImg.src = getAvatarSrc(gameState.avatar);
            }
        }"""

# Try to replace both variations
content = re.sub(r'\s*// Setup Avatar Image\n\s*this\.avatarImg = new Image\(\);\n\s*if \(isPlayer1\) \{\n\s*this\.avatarImg\.src = getAvatarSrc\(gameState\.avatar(?:, false)?\);\n\s*\} else \{\n\s*this\.avatarImg\.src = getAvatarSrc\(gameState\.opponentAvatar(?:, true)?\);\n\s*\}', '\n' + replacement_tank, content, flags=re.DOTALL)

with open('public/game.js', 'w') as f:
    f.write(content)
