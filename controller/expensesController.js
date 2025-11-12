const Expense = require("../model/expenseModel");
const response = require("../utils/response");
const moment = require("moment-timezone");

moment.tz.setDefault("Asia/Tashkent");

class ExpensesController {
  async createExpense(req, res) {
    try {
      const expense = await Expense.create(req.body);
      if (!expense) return response.notFound(res, "Xarajat qo'shilmadi");
      return response.success(res, "Xarajat qo'shildi", expense);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  // Backend remains the same (already handles req.query.startDate and endDate)
  async getExpenses(req, res) {
    try {
      let filter = {};

      let startDate = moment(req.query.startDate).startOf("day").toDate();
      let endDate = moment(req.query.endDate).endOf("day").toDate();


      filter.createdAt = { $gte: startDate, $lte: endDate };

      const expenses = await Expense.find(filter)
        .populate('relevantId') // relevantId ni populate qilish
        .sort({ createdAt: -1 });
      if (!expenses.length)
        return response.notFound(res, "Xarajatlar topilmadi");
      return response.success(res, "Xarajatlar ro'yxati", expenses);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  async updateExpense(req, res) {
    try {
      const { id } = req.params;
      const expense = await Expense.findByIdAndUpdate(id, req.body);

      if (!expense) return response.notFound(res, "Xarajat topilmadi");
      return response.success(res, "Xarajat yangilandi", expense);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  async deleteExpense(req, res) {
    try {
      const { id } = req.params;
      const expense = await Expense.findByIdAndDelete(id);
      if (!expense) return response.notFound(res, "Xarajat topilmadi");
      return response.success(res, "Xarajat o'chirildi", expense);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }
}

module.exports = new ExpensesController();
