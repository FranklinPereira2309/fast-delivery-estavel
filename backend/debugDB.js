const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
    try {
        const products = await prisma.product.findMany({
            include: { recipe: true }
        });
        const prodsWithRecipe = products.filter(p => p.recipe.length > 0);
        console.log("Qtd de produtos com receita:", prodsWithRecipe.length);
        if (prodsWithRecipe.length > 0) {
            console.log("Produtos com receita:", prodsWithRecipe.map(p => p.name));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}
checkDB();
