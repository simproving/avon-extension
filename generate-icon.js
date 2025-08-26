#!/usr/bin/env node

/**
 * Generate a 128x128 PNG store icon with the letter 'A' for the Avon extension.
 * This script uses Canvas API to create the icon.
 */

const fs = require('fs');

// Check if canvas is available
let Canvas;
try {
    Canvas = require('canvas');
} catch (error) {
    console.log('Canvas module not found. Installing...');
    console.log('Please run: npm install canvas');
    console.log('Or use the HTML preview file to generate the icon manually.');
    process.exit(1);
}

function createStoreIcon() {
    // Create a 128x128 canvas
    const canvas = Canvas.createCanvas(128, 128);
    const ctx = canvas.getContext('2d');
    
    // Create gradient for background
    const bgGradient = ctx.createLinearGradient(0, 0, 128, 128);
    bgGradient.addColorStop(0, '#4A90E2');
    bgGradient.addColorStop(1, '#357ABD');
    
    // Draw background circle
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, 2 * Math.PI);
    ctx.fillStyle = bgGradient;
    ctx.fill();
    ctx.strokeStyle = '#2E5B8A';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw letter A with proper hole
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 80px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', 64, 64);
    
    // Draw the hole in the A using the background gradient
    ctx.fillStyle = bgGradient;
    ctx.beginPath();
    ctx.moveTo(62, 60);
    ctx.lineTo(66, 60);
    ctx.lineTo(64, 50);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2E5B8A';
    ctx.lineWidth = 1;
    ctx.stroke();
    
    return canvas;
}

function main() {
    try {
        // Generate the icon
        const canvas = createStoreIcon();
        
        // Save as PNG
        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync('store-icon-128.png', buffer);
        
        console.log('✅ Store icon created successfully: store-icon-128.png');
        console.log('📏 Size: 128x128 pixels');
        
        // Also create smaller versions
        const icon16 = Canvas.createCanvas(16, 16);
        const ctx16 = icon16.getContext('2d');
        ctx16.drawImage(canvas, 0, 0, 16, 16);
        fs.writeFileSync('store-icon-16.png', icon16.toBuffer('image/png'));
        
        const icon48 = Canvas.createCanvas(48, 48);
        const ctx48 = icon48.getContext('2d');
        ctx48.drawImage(canvas, 0, 0, 48, 48);
        fs.writeFileSync('store-icon-48.png', icon48.toBuffer('image/png'));
        
        console.log('✅ Additional icon sizes created: 16x16 and 48x48');
        
    } catch (error) {
        console.error('❌ Error creating icon:', error.message);
        console.log('\n💡 Alternative: Open icon-preview.html in your browser to generate the icon manually.');
    }
}

if (require.main === module) {
    main();
}
