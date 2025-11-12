const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    type: {
      type: String,
      enum: ["kirim", "chiqim"],
      required: true,
    },
    category: {
      type: String,
      trim: true,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    paymentType: {
      type: String,
      enum: ["naqt", "karta"],
    },
    relevantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "stories",
    },
  },
  { timestamps: true }
);

const Expense = mongoose.model("expense", expenseSchema);



// 🔹 Dublikatlarni avtomatik tozalovchi funksiya
// async function removeDuplicateExpenses() {
//   try {
//     console.log("🔎 Dublikat 'Bemor to'lovi' yozuvlarini tekshiryapman...");

//     const duplicates = await Expense.aggregate([
//       { $match: { category: "Bemor to'lovi" } },
//       {
//         $group: {
//           _id: "$relevantId",
//           count: { $sum: 1 },
//           ids: { $push: "$_id" },
//         },
//       },
//       { $match: { count: { $gt: 1 } } },
//     ]);

//     if (duplicates.length === 0) {
//       console.log("✅ Dublikat topilmadi. Hammasi joyida.");
//       return;
//     }

//     console.log(`⚠️ ${duplicates.length} ta relevantId bo‘yicha dublikat topildi.`);

//     let totalDeleted = 0;
//     for (const dup of duplicates) {
//       const idsToDelete = dup.ids.slice(1); // 1 tasi qolsin
//       const result = await Expense.deleteMany({ _id: { $in: idsToDelete } });
//       totalDeleted += result.deletedCount;
//     }

//     console.log(`🧹 ${totalDeleted} ta dublikat muvaffaqiyatli o‘chirildi.`);
//   } catch (err) {
//     console.error("❌ Dublikatlarni o‘chirishda xatolik:", err.message);
//   }
// }

// // 🔹 Model yuklanganda avtomatik ishga tushsin
// Expense.once("init", () => {
//   removeDuplicateExpenses();
// });
module.exports = Expense;
