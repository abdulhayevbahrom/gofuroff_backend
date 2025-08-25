const response = require("../utils/response");
const patientsDB = require("../model/patientModel");
const storyDB = require("../model/storyModel");
const adminDB = require("../model/adminModel");
const expenseModel = require("../model/expenseModel");

const moment = require("moment-timezone");
moment.tz.setDefault("Asia/Tashkent");

class PatientController {
  async createPatient(req, res) {
    let io = req.app.get("socket");
    const mongoose = require("mongoose");
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      let {
        firstname,
        lastname,
        idNumber,
        phone,
        address,
        year,
        gender,
        paymentType,
        payment_amount,
        services,
        doctorId,
        description,
        createdAt,
        isImmediate,
      } = req.body;

      // const appointmentTime = new Date(createdAt);
      const appointmentTime = moment(createdAt).format("YYYY-MM-DD HH:mm:ss");

      // Telefon raqami orqali bemorni qidirish
      let patient = await patientsDB.findOne({ phone }).session(session);
      if (!patient) {
        patient = await patientsDB.create(
          [
            {
              firstname,
              lastname,
              idNumber,
              phone,
              address,
              year,
              gender,
            },
          ],
          { session }
        );
        patient = patient[0];
      }

      // Validate doctorId
      if (!doctorId) {
        await session.abortTransaction();
        session.endSession();
        return response.error(res, "Doktor tanlanishi kerak");
      }

      let doctor = await adminDB.findById(doctorId).session(session);
      if (!doctor) {
        await session.abortTransaction();
        session.endSession();
        return response.error(res, "Doktor topilmadi");
      }

      // Calculate total service price (if services provided)
      const totalServicePrice = (services || []).reduce(
        (sum, service) => sum + (service.price || 0),
        0
      );

      let orderNumber = null;
      let paymentStatus = false;
      let finalPaymentAmount = 0;

      if (isImmediate) {
        // Shu doktorga yozilgan,  storylarni sanash
        // const today = new Date();
        // today.setHours(0, 0, 0, 0);
        // const tomorrow = new Date(today);
        // tomorrow.setDate(today.getDate() + 1);

        // Bugungi sanani Toshkent vaqtida olish
        const today = moment().tz("Asia/Tashkent").startOf("day").toDate();
        const tomorrow = moment().tz("Asia/Tashkent").endOf("day").toDate();

        const count = await storyDB
          .countDocuments({
            doctorId: doctorId,
            createdAt: { $gte: today, $lt: tomorrow },
          })
          .session(session);

        // order_number = navbat raqami
        orderNumber = count + 1;

        // To'g'ri payment_status hisoblash
        paymentStatus = payment_amount >= totalServicePrice;

        finalPaymentAmount = payment_amount;
      } else {
        // Future appointment: no order number, no payment required now
        finalPaymentAmount = 0;
      }

      // Story yaratish
      const story = await storyDB.create(
        [
          {
            patientId: patient._id,
            doctorId,
            order_number: orderNumber,
            paymentType,
            payment_status: paymentStatus,
            payment_amount: finalPaymentAmount,
            services: services || [],
            description: description || "",
            startTime: appointmentTime,
            createdAt: appointmentTime,
          },
        ],
        { session }
      );
      const createdStory = story[0];

      if (isImmediate) {
        await expenseModel.create(
          [
            {
              name: "Bemor to'lovi",
              amount: finalPaymentAmount,
              type: "kirim",
              category: "Bemor to'lovi",
              description: "Bemor to'lovi",
              paymentType: paymentType,
              relevantId: createdStory._id,
            },
          ],
          { session }
        );
      }

      await session.commitTransaction();
      session.endSession();

      if (isImmediate) {
        io.emit("new_story", createdStory);
      }

      const responseData = {
        patient: {
          firstname,
          lastname,
          phone,
          idNumber,
          address,
          order_number: orderNumber,
          createdAt: createdStory.createdAt,
        },
      };

      if (isImmediate) {
        responseData.doctor = {
          firstName: doctor.firstName,
          lastName: doctor.lastName,
          specialization: doctor.specialization,
          phone: phone,
          admission_price: totalServicePrice,
        };
        responseData.services = services || [];
      }

      return response.success(
        res,
        "Bemor va story muvaffaqiyatli yaratildi",
        responseData
      );
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error in createPatient:", err);
      return response.serverError(res, "Server error occurred", err.message);
    }
  }

  // Telefon raqam bo‘yicha bemorni olish
  async getPatientByPhone(req, res) {
    try {
      const phone = req.params.phone.replace(/\s/g, "");
      const patient = await patientsDB.findOne({ phone });
      if (!patient) {
        return response.notFound(res, "Bemor topilmadi");
      }
      return response.success(res, "Bemor topildi", patient);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }
  async getPatients(req, res) {
    try {
      const patients = await patientsDB.find().sort({ createdAt: -1 });
      if (!patients.length) return response.notFound(res, "Bemorlar topilmadi");
      return response.success(res, "Success", patients);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  // Bemorni ID orqali olish
  async getPatientById(req, res) {
    try {
      const patient = await patientsDB.findById(req.params.id);
      if (!patient) return response.notFound(res, "Bemor topilmadi");
      return response.success(res, "Success", patient);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  // Bemorni yangilash
  async updatePatient(req, res) {
    try {
      const patient = await patientsDB.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );
      if (!patient) return response.notFound(res, "Bemor topilmadi");
      return response.success(res, "Bemor yangilandi", patient);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }
  // router.put('/client/update/:id', async (req, res) => {
  async updatePatientBmi(req, res) {
    try {
      const { id } = req.params;
      const { height, weight, bloodGroup } = req.body;

      if (!id) {
        return response.notFound(res, "Patient ID is required");
      }

      const updateData = {};
      if (height !== undefined) updateData.height = Number(height) || null;
      if (weight !== undefined) updateData.weight = Number(weight) || null;
      if (bloodGroup !== undefined) updateData.bloodGroup = bloodGroup || null;

      if (height && weight) {
        const heightInMeters = Number(height) / 100;
        updateData.bmi = Number(
          (Number(weight) / (heightInMeters * heightInMeters)).toFixed(2)
        );
      } else if (height === null || weight === null) {
        updateData.bmi = null;
      }

      const updatedPatient = await patientsDB.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!updatedPatient) {
        return response.notFound(res, "Patient not found");
      }

      response.success(res, "Patient updated successfully", updatedPatient);
    } catch (error) {
      return response.serverError(res, error.message, error);
    }
  }

  // Bemorni o'chirish
  async deletePatient(req, res) {
    try {
      const patient = await patientsDB.findByIdAndDelete(req.params.id);
      if (!patient) return response.notFound(res, "Bemor topilmadi");
      return response.success(res, "Bemor o'chirildi", patient);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  async redirectPatient(req, res) {
    try {
      let io = req.app.get("socket");
      let { storyId, newDoctorId, services } = req.body;

      let story = await storyDB.findById(storyId);
      if (!story) return response.notFound(res, "Story topilmadi");
      let newStory = {
        patientId: story?.patientId,
        doctorId: newDoctorId,
        redirectStatus: true,
        services: services,
      };

      let result = await storyDB.create(newStory);
      if (!result) return response.notFound(res, "Story topilmadi");
      io.emit("new_story", result);
      return response.success(res, "Story yaratildi", result);
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }

  // async updateRedirectPatient(req, res) {
  //   try {
  //     const { storyId, paymentType, payment_amount } = req.body;

  //     // Storyni topish va patient/doctor ma'lumotlarini populate qilish
  //     const story = await storyDB
  //       .findById(storyId)
  //       .populate("patientId")
  //       .populate("doctorId");
  //     if (!story) return response.notFound(res, "Story topilmadi", "hatolik");

  //     // Xizmatlar narxini hisoblash
  //     const servicesPrice = (story.services || []).reduce(
  //       (total, service) => total + (service.price || 0),
  //       0
  //     );

  //     // Navbat raqamini hisoblash
  //     const today = new Date();
  //     today.setHours(0, 0, 0, 0);
  //     const tomorrow = new Date(today);
  //     tomorrow.setDate(today.getDate() + 1);

  //     const count = await storyDB.countDocuments({
  //       doctorId: story.doctorId._id,
  //       view: false,
  //       createdAt: { $gte: today, $lt: tomorrow },
  //     });
  //     const order_number = count + 1;

  //     // Storyni yangilash
  //     story.paymentType = paymentType;
  //     story.payment_amount = payment_amount;
  //     story.payment_status = payment_amount >= servicesPrice;
  //     story.redirectStatus = false;
  //     story.order_number = order_number;
  //     await story.save();

  //     await expenseModel.create(
  //       [
  //         {
  //           name: "Bemor to'lovi",
  //           amount: payment_amount,
  //           type: "kirim",
  //           category: "Bemor to'lovi",
  //           description: "Bemor to'lovi",
  //           paymentType: paymentType,
  //           relevantId: story._id,
  //         },
  //       ],
  //       { session }
  //     );

  //     return response.success(res, "Bemor va story muvaffaqiyatli yangilandi", {
  //       patient: {
  //         firstname: story.patientId.firstname,
  //         lastname: story.patientId.lastname,
  //         phone: story.patientId.phone,
  //         idNumber: story.patientId.idNumber,
  //         address: story.patientId.address,
  //         order_number,
  //         createdAt: story.createdAt,
  //       },
  //       doctor: {
  //         firstName: story.doctorId.firstName,
  //         lastName: story.doctorId.lastName,
  //         specialization: story.doctorId.specialization,
  //         phone: story.doctorId.phone,
  //         admission_price: servicesPrice,
  //       },
  //       services: story.services || [],
  //     });
  //   } catch (err) {
  //     console.error("Error in updateRedirectPatient:", err);
  //     return response.serverError(res, err.message, err);
  //   }
  // }

  async updateRedirectPatient(req, res) {
    const mongoose = require("mongoose");
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { storyId, paymentType, payment_amount } = req.body;

      // Storyni topish va patient/doctor ma'lumotlarini populate qilish
      const story = await storyDB
        .findById(storyId)
        .populate("patientId")
        .populate("doctorId")
        .session(session);
      if (!story) {
        await session.abortTransaction();
        session.endSession();
        return response.notFound(res, "Story topilmadi", "hatolik");
      }

      // Xizmatlar narxini hisoblash
      const servicesPrice = (story.services || []).reduce(
        (total, service) => total + (service.price || 0),
        0
      );

      // Navbat raqamini hisoblash
      // const today = new Date();
      // today.setHours(0, 0, 0, 0);
      // const tomorrow = new Date(today);
      // tomorrow.setDate(today.getDate() + 1);

      const today = moment().tz("Asia/Tashkent").startOf("day").toDate();
      const tomorrow = moment().tz("Asia/Tashkent").endOf("day").toDate();

      // const count = await storyDB
      //   .countDocuments({
      //     doctorId: story.doctorId._id,
      //     // view: false,
      //     createdAt: { $gte: today, $lt: tomorrow },
      //   })
      //   .session(session);
      // const order_number = count + 1;

      const latestStory = await storyDB
        .findOne({
          doctorId: story.doctorId._id,
          createdAt: { $gte: today, $lte: tomorrow },
        })
        .sort({ order_number: -1 })
        .session(session);

      const order_number = latestStory ? latestStory.order_number + 1 : 1;

      // Storyni yangilash
      story.paymentType = paymentType;
      story.payment_amount = payment_amount;
      story.payment_status = payment_amount >= servicesPrice;
      story.redirectStatus = false;
      story.order_number = order_number;
      await story.save({ session });

      await expenseModel.create(
        [
          {
            name: "Bemor to'lovi",
            amount: payment_amount,
            type: "kirim",
            category: "Bemor to'lovi",
            description: "Bemor to'lovi",
            paymentType: paymentType,
            relevantId: story._id,
          },
        ],
        { session }
      );

      await session.commitTransaction();
      session.endSession();

      return response.success(res, "Bemor va story muvaffaqiyatli yangilandi", {
        patient: {
          firstname: story.patientId.firstname,
          lastname: story.patientId.lastname,
          phone: story.patientId.phone,
          idNumber: story.patientId.idNumber,
          address: story.patientId.address,
          order_number,
          createdAt: story.createdAt,
        },
        doctor: {
          firstName: story.doctorId.firstName,
          lastName: story.doctorId.lastName,
          specialization: story.doctorId.specialization,
          phone: story.doctorId.phone,
          admission_price: servicesPrice,
        },
        services: story.services || [],
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Error in updateRedirectPatient:", err);
      return response.serverError(res, err.message, err);
    }
  }

  async getRedirectPatients(req, res) {
    try {
      let allRedirectedPatients = await storyDB
        .find({ redirectStatus: true })
        .populate("patientId")
        .populate("doctorId");
      if (allRedirectedPatients.length === 0) {
        return response.notFound(res, "Yo'naltirilgan bemorlar topilmadi");
      }
      return response.success(
        res,
        "Yo'naltirilgan bemorlar topildi",
        allRedirectedPatients
      );
    } catch (err) {
      return response.serverError(res, err.message, err);
    }
  }
}

module.exports = new PatientController();
