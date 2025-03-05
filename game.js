window.addEventListener('wheel', e => e.preventDefault(), { passive: false });
window.addEventListener('keydown', e => {
    if (e.ctrlKey && (e.key === '+' || e.key === '-')) e.preventDefault();
});

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const PLAYER_SCALE = 2.2;
const HEALTHBAR_SCALE = 2.5;
const TRAP_SCALE = 1.8; 
const BLOCK_SCALE = 2;
const SLIME_SCALE = 2;
const GRAVITY = 0.8;
const JUMP_COOLDOWN = 500;
const TILE_SIZE = 32 * 3;
const PLAYER_WIDTH = 32;
const PLAYER_HEIGHT = 32;
const MOVEMENT_SPEED = 5;
const JUMP_FORCE = -15;
const baseWidth = 1366;
const baseHeight = 633;
const PORTAL_SCALE = 3; // 3x scale factor for portal
const PORTAL_FRAME_COUNT = 6;
const PORTAL_ANIM_DELAY = 100;
const PORTAL_WIDTH = 32; // Original sprite width
const PORTAL_HEIGHT = 32; // Original sprite height
const FADE_DURATION = 2000; // 2 seconds
const TEXT_DISPLAY_TIME = 3000; // 3 seconds

 // ms per frame
let scaleX = 1;
let scaleY = 1;

const sounds = {
    jump: document.getElementById('jumpSound'),
    bgm: document.getElementById('bgSound'),
    death: document.getElementById('deathSound'),
    damage: document.getElementById('damageSound'),
    slimeJump: document.getElementById('slimeJumpSound')
};

let cameraX = 0;

function resizeCanvas() {
    canvas.width = 1366;
    canvas.height = 633;

    scaleX = canvas.width / baseWidth;
    scaleY = canvas.height / baseHeight;

    initPlayerPosition();
}

const assets = {
    rightStand: loadImage('assets/rightStand.png'),
    rightWalk1: loadImage('assets/rightWalkLeft.png'),
    rightWalk2: loadImage('assets/rightWalkRight.png'),
    leftStand: loadImage('assets/leftStand.png'),
    leftWalk1: loadImage('assets/leftWalkLeft.png'),
    leftWalk2: loadImage('assets/leftWalkRight.png'),
    bg: loadImage('assets/bg.png'),
    ground: loadImage('assets/ground.png'),
    obstacle: loadImage('assets/obstacle.png'),
    healthBar: loadImage('assets/healthbar.png'),
    spikeTrap: loadImage('assets/spike_trap.png'),
    pillarTrap: loadImage('assets/pillar.png'),
    solidBlock: loadImage('assets/solid_block.png'),
    slimeBlock: loadImage('assets/slime_block.png'),
    portal: loadImage('assets/portal.png')
};

function loadImage(src) {
    const img = new Image();
    img.src = src;
    return new Promise(resolve => img.onload = () => resolve(img));
}

function drawRedTintedSprite(ctx, img, x, y, width, height) {
    const offCanvas = document.createElement('canvas');
    offCanvas.width = img.width;
    offCanvas.height = img.height;
    const offCtx = offCanvas.getContext('2d');

    offCtx.drawImage(img, 0, 0);
    offCtx.globalCompositeOperation = 'source-atop';
    offCtx.fillStyle = 'red';
    offCtx.fillRect(0, 0, img.width, img.height);
    offCtx.globalCompositeOperation = 'source-over';

    ctx.drawImage(offCanvas, 0, 0, img.width, img.height, x, y, width, height);
}

function drawBackground() {
    ctx.imageSmoothingEnabled = false;
    const img = assets.bg;
    const aspectRatio = img.width / img.height;
    let bgWidth = canvas.width;
    let bgHeight = canvas.width / aspectRatio;

    if (bgHeight < canvas.height) {
        bgHeight = canvas.height;
        bgWidth = canvas.height * aspectRatio;
    }

    ctx.drawImage(img, 0, 0, bgWidth, bgHeight);
}

let currentStage = 0;
let canJump = true;

const TRAP_TYPES = {
    SPIKE: {
        spriteWidth: 43,
        spriteHeight: 43,
        hitboxWidth: 29,
        hitboxHeight: 25,
        hitboxOffsetX: (53 - 30) / 2,
        hitboxOffsetY: 12,
        damage: 10,
        scale: TRAP_SCALE,
        isSolid: true
    },

    PILLAR: {
        isSolid: true,
        damage: 25,
        spriteWidth: 25,
        spriteHeight: 64
    }
};

const BLOCK_TYPES = {
    SOLID: {
        spriteWidth: 32,
        spriteHeight: 16,
        hitboxWidth: 16,
        hitboxHeight: 16,
        hitboxOffsetX: 12,
        hitboxOffsetY: 2
    },

    SLIME: {
        spriteWidth: 32,
        spriteHeight: 16,
        hitboxWidth: 28,   // Horizontal collision area
        hitboxHeight: 4,    // Only top 4px for bounce detection
        hitboxOffsetX: 2,
        hitboxOffsetY: 10,  // Push hitbox to top of block
        scale: 2
    }
};

const stages = new Array(10).fill().map(() => ({
    width: 6000,
    obstacles: [],
    traps: [],
    blocks: [] 
}));

let portal = {
    x: 0,
    y: 0,
    width: 32,
    height: 32,
    currentFrame: 0,
    lastFrameTime: 0,
    active: false
};

function addTrap(stageIndex, type, x, y) {
    if (!stages[stageIndex]) return;
    const trapType = TRAP_TYPES[type];
    stages[stageIndex].traps.push({
        type: type,
        x: x + trapType.hitboxOffsetX,
        y: y + trapType.hitboxOffsetY,
        width: trapType.hitboxWidth,
        height: trapType.hitboxHeight,
        spriteX: x,
        spriteY: y
    });
}

function addPillarTrap(i, x, n, t, s, v) {
    if (!stages[i]) return;
    const scaledWidth = 25 * 3;
    const scaledHeight = 64 * 3;

    for(let j = 0; j < n; j++) {
        stages[i].traps.push({
            type: 'PILLAR',
            x: x + (j * scaledWidth),
            y: 0,
            spriteX: x + (j * scaledWidth),
            width: scaledWidth,
            height: scaledHeight,
            state: 'waiting', 
            timer: t,
            cycleTime: t,
            stayDuration: s,
            velocity: v,
            originalY: 0,
            hitPlayer: false
        });
    }
}

function addSolidBlock(stageIndex, x, y) {
    const blockType = BLOCK_TYPES.SOLID;
    stages[stageIndex].blocks.push({
        type: 'SOLID',
        spriteX: x,
        spriteY: y,
        x: x + blockType.hitboxOffsetX,
        y: y + blockType.hitboxOffsetY,
        width: blockType.hitboxWidth,
        height: blockType.hitboxHeight
    });
}

function addSlimeBlock(stageIndex, x, y, velocity) {
    const blockType = BLOCK_TYPES.SLIME;
    stages[stageIndex].blocks.push({
        type: 'SLIME',
        spriteX: x,
        spriteY: y,
        x: x + blockType.hitboxOffsetX,
        y: y + blockType.hitboxOffsetY,
        width: blockType.hitboxWidth,
        height: blockType.hitboxHeight,
        velocity: -Math.abs(velocity) // Ensure negative value for upward force
    });
}

function addPortal(x, y) {
    portal = {
        x: x,
        y: y,
        currentFrame: 0,
        lastFrameTime: 0,
        active: true
    };
}


addTrap(0, 'SPIKE', 750, 481);   
addTrap(0, 'SPIKE', 950, 381);   
addTrap(0, 'SPIKE', 1150, 441);  
addTrap(0, 'SPIKE', 1350, 441);  
addTrap(0, 'SPIKE', 1550, 451);  
addTrap(0, 'SPIKE', 1750, 471);  
addTrap(0, 'SPIKE', 1950, 461);  
addTrap(0, 'SPIKE', 2085, 481);  
addTrap(0, 'SPIKE', 2350, 481);  
addTrap(0, 'SPIKE', 2350, 251);  

addPillarTrap(0, 2900, 1, 2.5, 0.7, 300);
addPillarTrap(0, 2975, 1, 2.3, 0.5, 320);
addPillarTrap(0, 3050, 1, 2.0, 0.7, 350);
addPillarTrap(0, 3125, 1, 2.2, 0.5, 400);
addPillarTrap(0, 3200, 1, 1.8, 0.5, 420);
addPillarTrap(0, 3275, 1, 2.5, 0.7, 450);
addPillarTrap(0, 3350, 1, 2.1, 0.6, 500);
addPillarTrap(0, 3425, 1, 1.9, 0.5, 550);
addPillarTrap(0, 3500, 1, 2.0, 0.7, 600);
addPillarTrap(0, 3575, 1, 1.8, 0.5, 580);

addSolidBlock(0, 4050, 441);
addTrap(0, 'SPIKE', 4150, 401);
addSlimeBlock(0, 4200, 481, -25);
addTrap(0, 'SPIKE', 4280, 441);
addSolidBlock(0, 4350, 361);
addPillarTrap(0, 4350, 1, 1.5, 0.5, 300);
addTrap(0, 'SPIKE', 4350, 1);
addPillarTrap(0, 4450, 1, 0.75, 0.3, 400);
addPillarTrap(0, 4550, 1, 0.3, 0.6, 500);
addSolidBlock(0, 4650, 421);
addTrap(0, 'SPIKE', 4750, 391);
addSlimeBlock(0, 4800, 461, -25);
addSolidBlock(0, 4950, 351);
addTrap(0, 'SPIKE', 5000, 301);
addTrap(0, 'SPIKE', 5050, 401);
addSlimeBlock(0, 5100, 481, -25);
addSolidBlock(0, 5250, 361);
addSolidBlock(0, 5314, 361);
addPortal(5370, 280);



const video = document.getElementById('birthdayVideo');
video.src = 'assets/birthday_video.mp4';
video.style.position = 'fixed';
video.style.top = '0';
video.style.left = '0';
video.style.width = '100%';
video.style.height = '100%';
video.style.display = 'none';
document.body.appendChild(video);


const player = {
    x: 100,
    y: 0,
    spriteWidth: 32,
    spriteHeight: 32,
    scale: PLAYER_SCALE,
    hitboxWidth: 28,
    hitboxHeight: 30,
    hitboxOffsetX: 2,
    hitboxOffsetY: 2,
    velocityY: 0,
    grounded: false,
    speed: MOVEMENT_SPEED,
    jumpForce: JUMP_FORCE,
    facing: 'right',
    animationStep: 0,
    lastStepTime: 0,
    worldX: 100
};

let currentHealth = 100;
const HEALTH_BAR_POS = { x: 10, y: 10 };
const HEALTH_FILL = {
    startX: 26,
    startY: 12,
    maxWidth: 100,
    height: 7
};

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

const keys = {};
window.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'd', 'w', ' '].includes(e.key)) {
        keys[e.key] = true;
    }
});
window.addEventListener('keyup', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'd', 'w', ' '].includes(e.key)) {
        keys[e.key] = false;
    }
});

function handleMovement() {
    if (currentHealth === 0) return;

    const stage = stages[currentStage];

    if (keys['ArrowLeft'] || keys['a']) player.worldX -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.worldX += player.speed;

    handleTrapCollisions();

    player.worldX = Math.max(0, Math.min(
        player.worldX, 
        stage.width - (player.hitboxWidth * player.scale)
    ));

    updateCamera();
    player.x = player.worldX - cameraX;

    if ((keys[' '] || keys['w'] || keys['ArrowUp']) && player.grounded && canJump) {
        player.velocityY = player.jumpForce;
        playSound(sounds.jump);
        player.grounded = false;
        canJump = false;
        setTimeout(() => canJump = true, JUMP_COOLDOWN);
    }
}

function updateCamera() {
    const stage = stages[currentStage];
    const screenMidpoint = canvas.width / 2;

    if (player.worldX > screenMidpoint) {
        const idealCameraX = player.worldX - screenMidpoint;
        cameraX = Math.min(idealCameraX, stage.width - canvas.width);
        cameraX = Math.max(0, cameraX);
    } else {
        cameraX = 0;
    }
}

function applyGravity() {
    player.y += player.velocityY;
    player.velocityY += GRAVITY;
}

function checkGroundCollision() {
    const groundY = canvas.height - TILE_SIZE;
    const scaledHitboxHeight = player.hitboxHeight * player.scale;

    if ((player.y + player.hitboxOffsetY) + scaledHitboxHeight > groundY) {
        player.y = groundY - scaledHitboxHeight - player.hitboxOffsetY;
        player.velocityY = 0;
        player.grounded = true;
    }
}

function drawEnvironment() {
    const groundY = canvas.height - TILE_SIZE;
    const stage = stages[currentStage];
    const tileCount = Math.ceil(stage.width / TILE_SIZE);

    for (let i = 0; i < tileCount; i++) {
        const worldTileX = i * TILE_SIZE;
        const screenX = worldTileX - cameraX;

        if (screenX > -TILE_SIZE && screenX < canvas.width) {
            ctx.drawImage(
                assets.ground,
                screenX,
                groundY,
                TILE_SIZE,
                TILE_SIZE
            );
        }
    }

    ctx.fillStyle = 'white';
    ctx.font = '14px Arial';
    ctx.fillText(`World X: ${Math.round(player.worldX)}, Camera X: ${Math.round(cameraX)}`, 10, 20);
}

function updateAnimation() {
    const now = Date.now();

    if (keys['ArrowRight'] || keys['d'] || keys['ArrowLeft'] || keys['a']) {
        if (now - player.lastStepTime > 200) {
            player.animationStep = (player.animationStep + 1) % 2;
            player.lastStepTime = now;
        }
    } else {
        player.animationStep = 0;
    }

    if (keys['ArrowRight'] || keys['d']) player.facing = 'right';
    if (keys['ArrowLeft'] || keys['a']) player.facing = 'left';
}

function initPlayerPosition() {
    const groundY = canvas.height - TILE_SIZE;
    player.y = groundY - (player.hitboxHeight * player.scale) - player.hitboxOffsetY;
    player.worldX = 4050;
    player.x = player.worldX;
    cameraX = 0;
}

function handleTrapCollisions() {
    const stage = stages[currentStage];
    const playerRect = getPlayerHitbox();
    const now = Date.now();

    stage.traps.forEach(trap => {
        const trapRect = getTrapHitbox(trap);
        
        if(checkCollision(playerRect, trapRect)) {
            if(TRAP_TYPES[trap.type].isSolid) {
                resolveCollision(playerRect, trapRect);
            }
            
            if(trap.type === 'PILLAR') {
                if(trap.state === 'descending' && !trap.hitPlayer && now - lastDamageTime > DAMAGE_COOLDOWN) {
                    currentHealth = Math.max(0, currentHealth - 25);
                    playSound(sounds.damage);
                    lastDamageTime = now;
                    trap.hitPlayer = true;
                    trap.state = 'staying';
                    trap.timer = trap.stayDuration;
                    
                    if(currentHealth === 0 && !isPlayerDead) {
                        isPlayerDead = true;
                        deathTimestamp = now;
                    }
                }
            } else if(now - lastDamageTime > DAMAGE_COOLDOWN) {
                currentHealth = Math.max(0, currentHealth - TRAP_TYPES[trap.type].damage);
                playSound(sounds.damage);
                lastDamageTime = now;
                if(currentHealth === 0 && !isPlayerDead) {
                    isPlayerDead = true;
                    deathTimestamp = now;
                }
            }
        }
    });
}

function playSound(sound) {
    const clone = sound.cloneNode(true);
    clone.play();
}

function drawTraps() {
    const stage = stages[currentStage];

    stage.traps.forEach(trap => {
        const trapType = TRAP_TYPES[trap.type];

        const screenX = trap.spriteX - cameraX;

        if(trap.type === 'PILLAR') {
            if(screenX > -trap.width && screenX < canvas.width) {
                ctx.drawImage(
                    assets.pillarTrap,
                    screenX,
                    trap.y,
                    trap.width,
                    trap.height
                );

                if(DEBUG_MODE) {
                    const hitbox = getTrapHitbox(trap);
                    ctx.fillStyle = "rgba(0, 0, 255, 0.4)";
                    ctx.fillRect(
                        hitbox.x - cameraX,
                        hitbox.y,
                        hitbox.width,
                        hitbox.height
                    );
                }
            }
        } else {
            if (screenX > -trapType.spriteWidth && screenX < canvas.width) {
                ctx.drawImage(
                    assets.spikeTrap,
                    screenX,
                    trap.spriteY,
                    trapType.spriteWidth * TRAP_SCALE,
                    trapType.spriteHeight * TRAP_SCALE
                );

                if (DEBUG_MODE) {
                    const hitbox = getTrapHitbox(trap);
                    ctx.fillStyle = "rgba(255, 0, 0, 0.4)";
                    ctx.fillRect(
                        hitbox.x - cameraX,
                        hitbox.y,
                        hitbox.width,
                        hitbox.height
                    );

                    ctx.strokeStyle = "red";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(
                        hitbox.x - cameraX,
                        hitbox.y,
                        hitbox.width,
                        hitbox.height
                    );
                }
            }
        }
    });
}

function drawBlocks() {
    const stage = stages[currentStage];
    
    stage.blocks.forEach(block => {
        const blockType = BLOCK_TYPES[block.type];
        const screenX = (block.spriteX - cameraX) * scaleX;
        const screenY = block.spriteY * scaleY;
        const scale = block.type === 'SLIME' ? blockType.scale : BLOCK_SCALE;

        // Draw block sprite
        ctx.drawImage(
            assets[`${block.type.toLowerCase()}Block`],
            screenX,
            screenY,
            blockType.spriteWidth * scale * scaleX,
            blockType.spriteHeight * scale * scaleY
        );

        // Debug hitbox
        if (DEBUG_MODE) {
            ctx.fillStyle = block.type === 'SLIME' ? "rgba(0, 255, 255, 0.3)" : "rgba(0, 255, 0, 0.3)";
            ctx.fillRect(
                (block.x - cameraX) * scaleX,
                block.y * scaleY,
                block.width * scale * scaleX,
                block.height * scale * scaleY
            );
        }
    });
}

function handleBlockCollisions() {
    const stage = stages[currentStage];
    const playerRect = getPlayerHitbox();
    let wasOnSlime = false;

    // Reset grounded state before checking collisions
    player.grounded = false;

    stage.blocks.forEach(block => {
        const blockRect = {
            x: block.x * scaleX,
            y: block.y * scaleY,
            width: block.width * (block.type === 'SLIME' ? BLOCK_TYPES.SLIME.scale : BLOCK_SCALE) * scaleX,
            height: block.height * (block.type === 'SLIME' ? BLOCK_TYPES.SLIME.scale : BLOCK_SCALE) * scaleY
        };

        if (checkCollision(playerRect, blockRect)) {
            const collisionSide = resolveBlockCollision(playerRect, blockRect, block);
            
            if (block.type === 'SLIME' && collisionSide === 'top') {
                // Apply slime bounce effect
                player.velocityY = block.velocity;
                wasOnSlime = true;
            }
        }
    });

    // Disable jumping while on slime
    if (wasOnSlime) {
        canJump = false;
    } else {
        canJump = true;
    }
}

function resolveBlockCollision(playerRect, blockRect, block) {
    const penBottom = blockRect.y - (playerRect.y + playerRect.height);
    const penTop = (blockRect.y + blockRect.height) - playerRect.y;
    const penLeft = (blockRect.x + blockRect.width) - playerRect.x;
    const penRight = blockRect.x - (playerRect.x + playerRect.width);

    const minPen = Math.min(
        Math.abs(penBottom),
        Math.abs(penTop),
        Math.abs(penLeft),
        Math.abs(penRight)
    );

    let collisionSide = null;

    if (minPen === Math.abs(penBottom)) { // Top collision
        collisionSide = 'top';
        player.y = (blockRect.y - playerRect.height) / scaleY - player.hitboxOffsetY;
        player.velocityY = 0;
        player.grounded = true;

        if (block && block.type === 'SLIME') {
            player.velocityY = block.velocity;
            playSound(sounds.slimeJump); // Add slime jump sound
        }
    } else if (minPen === Math.abs(penTop)) { // Bottom collision
        collisionSide = 'bottom';
        player.y = (blockRect.y + blockRect.height) / scaleY - player.hitboxOffsetY;
        player.velocityY = 0;
    } else {
        if (minPen === Math.abs(penLeft)) { // Left collision
            collisionSide = 'left';
            player.worldX = (blockRect.x + blockRect.width) / scaleX - player.hitboxOffsetX;
        } else if (minPen === Math.abs(penRight)) { // Right collision
            collisionSide = 'right';
            player.worldX = (blockRect.x - playerRect.width) / scaleX - player.hitboxOffsetX;
        }
    }

    return collisionSide;
}

function checkCollision(rect1, rect2) {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
}

function playSound(sound, volume = 1.0) {
    const clone = sound.cloneNode(true);
    clone.volume = volume;
    clone.play();
}

function resolveCollision(playerRect, trapRect) {
    const penRight = trapRect.x - (playerRect.x + playerRect.width);
    const penLeft = (trapRect.x + trapRect.width) - playerRect.x;
    const penBottom = trapRect.y - (playerRect.y + playerRect.height);
    const penTop = (trapRect.y + trapRect.height) - playerRect.y;

    const minPen = Math.min(
        Math.abs(penRight),
        Math.abs(penLeft),
        Math.abs(penBottom),
        Math.abs(penTop)
    );

    if (minPen === Math.abs(penRight)) {
        player.worldX = trapRect.x - playerRect.width - player.hitboxOffsetX;
    } else if (minPen === Math.abs(penLeft)) {
        player.worldX = trapRect.x + trapRect.width - player.hitboxOffsetX;
    } else if (minPen === Math.abs(penBottom)) {
        player.y = trapRect.y - playerRect.height - player.hitboxOffsetY;
        player.velocityY = 0;
    } else if (minPen === Math.abs(penTop)) {
        player.y = trapRect.y + trapRect.height - player.hitboxOffsetY;
        player.grounded = true;
        player.velocityY = 0;
    }
}

function getPlayerHitbox() {
    return {
        x: player.worldX + player.hitboxOffsetX,
        y: player.y + player.hitboxOffsetY,
        width: player.hitboxWidth * player.scale,
        height: player.hitboxHeight * player.scale
    };
}

function getTrapHitbox(trap) {
    if (trap.type === 'PILLAR') {
        return {
            x: trap.x,
            y: trap.y,
            width: trap.width,
            height: trap.height
        };
    }
    return {
        x: trap.x,
        y: trap.y,
        width: trap.width * TRAP_SCALE,
        height: trap.height * TRAP_SCALE
    };
}

let lastDamageTime = 0;
let isPlayerDead = false;
let deathTimestamp = null;
const DAMAGE_COOLDOWN = 500;

function drawHealthBar() {
    if (!assets.healthBar) return;

    ctx.save();
    ctx.scale(HEALTHBAR_SCALE, HEALTHBAR_SCALE);
    const scaledX = HEALTH_BAR_POS.x / HEALTHBAR_SCALE;
    const scaledY = HEALTH_BAR_POS.y / HEALTHBAR_SCALE;
    ctx.drawImage(assets.healthBar, scaledX, scaledY);

    const fillX = scaledX + HEALTH_FILL.startX;
    const fillY = scaledY + HEALTH_FILL.startY;
    ctx.fillStyle = '#cb455e';
    ctx.fillRect(fillX, fillY, currentHealth, HEALTH_FILL.height);
    ctx.restore();
}

let DEBUG_MODE = false;
window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 't') {
        DEBUG_MODE = !DEBUG_MODE;
        console.log(`Debug Mode: ${DEBUG_MODE ? 'ON' : 'OFF'}`);
    }
});

function drawPlayer() {
    if (isPlayerDead) {
        const blinkDuration = 1500;
        const elapsed = Date.now() - deathTimestamp;
        if (elapsed < blinkDuration) {
            if (Math.floor(elapsed / 200) % 2 === 0) {

            } else {
                return;
            }
        } else {
            respawnPlayer();
        }
    }

    let sprite;
    if (player.facing === 'right') {
        sprite = player.animationStep === 0 ? assets.rightWalk1 : assets.rightWalk2;
        if (!(keys['ArrowRight'] || keys['d'])) sprite = assets.rightStand;
    } else {
        sprite = player.animationStep === 0 ? assets.leftWalk1 : assets.leftWalk2;
        if (!(keys['ArrowLeft'] || keys['a'])) sprite = assets.leftStand;
    }

    const drawWidth = player.spriteWidth * player.scale;
    const drawHeight = player.spriteHeight * player.scale;

    if (!isPlayerDead && Date.now() - lastDamageTime < 200) {
        drawRedTintedSprite(ctx, sprite, player.x, player.y, drawWidth, drawHeight);
    } else {
        ctx.drawImage(sprite, player.x, player.y, drawWidth, drawHeight);
    }
}

function updatePillars(deltaTime) {
    const stage = stages[currentStage];

    stage.traps.forEach(trap => {
        if(trap.type !== 'PILLAR') return;

        const groundY = canvas.height - TILE_SIZE;
        const targetY = groundY - trap.height;

        switch(trap.state) {
            case 'waiting':
                trap.timer -= deltaTime;
                if(trap.timer <= 0) {
                    trap.state = 'descending';
                    trap.hitPlayer = false;
                }
                break;

            case 'descending':
                if(!trap.hitPlayer) {
                    trap.y += trap.velocity * deltaTime;
                    if(trap.y >= targetY) {
                        trap.y = targetY;
                        trap.state = 'staying';
                        trap.timer = trap.stayDuration;
                    }
                }
                break;

            case 'staying':
                trap.timer -= deltaTime;
                if(trap.timer <= 0) {
                    trap.state = 'ascending';
                }
                break;

            case 'ascending':
                trap.y -= trap.velocity * deltaTime;
                if(trap.y <= trap.originalY) {
                    trap.y = trap.originalY;
                    trap.state = 'waiting';
                    trap.timer = trap.cycleTime;
                }
                break;
        }
    });
}

function respawnPlayer() {
    if (isPlayerDead) {
        playSound(sounds.death);
    }
    currentHealth = 100;
    isPlayerDead = false;
    deathTimestamp = null;
    initPlayerPosition();
}

function checkPortalCollision() {
    const playerRect = getPlayerHitbox();
    const portalRect = {
        x: portal.x,
        y: portal.y,
        width: PORTAL_WIDTH * PORTAL_SCALE,
        height: PORTAL_HEIGHT * PORTAL_SCALE
    };

    if(checkCollision(playerRect, portalRect)) {
        triggerPortalSequence();
    }
}

function triggerPortalSequence() {
    // Disable all sounds
    sounds.bgm.pause();
    sounds.bgm.currentTime = 0;
    sounds.jump.pause();
    sounds.jump.currentTime = 0;

    // Initial fade out
    overlay.style.transition = `opacity ${FADE_DURATION}ms`;
    overlay.style.opacity = '1';

    // Phase 1: Show game credit after fadeout
    setTimeout(() => {
        const credits = document.getElementById('credits');
        const gameCredit = document.getElementById('gameCredit');
        
        credits.style.display = 'block';
        gameCredit.style.opacity = '1';
        gameCredit.classList.add('glow');

        // Phase 2: Fade out game credit
        setTimeout(() => {
            gameCredit.style.opacity = '0';
            
            // Phase 3: Show video credit
            setTimeout(() => {
                const videoCredit = document.getElementById('videoCredit');
                videoCredit.style.opacity = '1';
                videoCredit.classList.add('glow');

                // Phase 4: Fade out video credit and show video
                setTimeout(() => {
                    videoCredit.style.opacity = '0';
                    credits.style.display = 'none';

                    // Prepare video
                    const video = document.getElementById('birthdayVideo');
                    video.style.opacity = '0';
                    video.style.display = 'block';
                    video.style.visibility = 'visible';
                    
                    // Fade in video
                    setTimeout(() => {
                        video.style.transition = `opacity ${FADE_DURATION}ms`;
                        video.style.opacity = '1';
                    }, 500);

                    video.play().catch(error => {
                        console.error('Video playback failed:', error);
                        window.open('birthday_video.mp4', '_blank');
                    });

                    video.onended = () => {
                        // Fade out video
                        video.style.opacity = '0';
                        setTimeout(() => {
                            video.style.display = 'none';
                            canvas.style.display = 'block';
                            overlay.style.opacity = '0';
                            respawnPlayer();
                            sounds.bgm.play();
                        }, FADE_DURATION);
                    };
                }, FADE_DURATION);
            }, TEXT_DISPLAY_TIME);
        }, TEXT_DISPLAY_TIME);
    }, FADE_DURATION);
}

function drawPortal() {
    if(!portal.active) return;
    
    const frameWidth = PORTAL_WIDTH;
    const screenX = (portal.x - cameraX) * scaleX;
    const screenY = portal.y * scaleY;
    const drawWidth = PORTAL_WIDTH * PORTAL_SCALE * scaleX;
    const drawHeight = PORTAL_HEIGHT * PORTAL_SCALE * scaleY;
    
    ctx.drawImage(
        assets.portal,
        portal.currentFrame * frameWidth, 0,
        frameWidth, PORTAL_HEIGHT,
        screenX, screenY,
        drawWidth, drawHeight
    );
}

function updatePortalAnimation() {
    const now = Date.now();
    if(now - portal.lastFrameTime > PORTAL_ANIM_DELAY) {
        portal.currentFrame = (portal.currentFrame + 1) % PORTAL_FRAME_COUNT;
        portal.lastFrameTime = now;
    }
}


async function init() {
    canvas.removeEventListener('click', init);

    for (const key in assets) {
        assets[key] = await assets[key];
    }

    initPlayerPosition();
    sounds.bgm.play();
    requestAnimationFrame(update);
}

let lastFrameTime = Date.now();

function update() {
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastFrameTime) / 1000;
    lastFrameTime = currentTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if(portal.active) {
        updatePortalAnimation();
        checkPortalCollision();
    }

    updatePillars(deltaTime);
    handleMovement();
    handleBlockCollisions();
    applyGravity();
    checkGroundCollision();
    updateAnimation();

    drawBackground();
    drawBlocks();
    drawTraps();
    drawPortal();
    drawHealthBar();
    drawPlayer();
    drawEnvironment();

    requestAnimationFrame(update);
}

window.addEventListener('resize', resizeCanvas);
canvas.addEventListener('click', init);