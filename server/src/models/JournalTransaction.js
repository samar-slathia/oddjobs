const mongoose = require('mongoose');

const JournalLineSchema = new mongoose.Schema({
  accountCode: {
    type: String,
    required: true,
    enum: [
      '1010', // Payment Clearing / Gateway
      '1020', // Customer Receivable
      '2010', // Provider Payable (Labour)
      '2020', // Provider Payable (Materials)
      '4010', // Platform Commission Revenue
      '5010'  // Promotional Subsidy Expense
    ]
  },
  direction: {
    type: String,
    required: true,
    enum: ['debit', 'credit']
  },
  amountPaise: {
    type: Number,
    required: true,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    },
    min: [1, 'Amount must be greater than zero']
  },
  partyId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false
  }
}, { _id: false });

const JournalTransactionSchema = new mongoose.Schema({
  idempotencyKey: {
    type: String,
    required: true,
    unique: true
  },
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  transactionType: {
    type: String,
    required: true,
    enum: ['completion', 'adjustment', 'refund']
  },
  currency: {
    type: String,
    required: true,
    default: 'INR',
    enum: ['INR']
  },
  postedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    required: true,
    enum: ['posted'],
    default: 'posted'
  },
  lines: {
    type: [JournalLineSchema],
    required: true,
    validate: [
      {
        validator: function (lines) {
          return lines.length >= 2;
        },
        message: 'Journal must have at least two lines'
      },
      {
        validator: function (lines) {
          let totalDebits = 0;
          let totalCredits = 0;
          for (const line of lines) {
            if (line.direction === 'debit') {
              totalDebits += line.amountPaise;
            } else if (line.direction === 'credit') {
              totalCredits += line.amountPaise;
            }
          }
          return totalDebits === totalCredits;
        },
        message: 'Total debits must equal total credits'
      }
    ]
  },
  totalDebitsPaise: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  },
  totalCreditsPaise: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value'
    }
  }
}, { timestamps: true });

// Ensure records are immutable once posted
JournalTransactionSchema.pre('save', function() {
  if (!this.isNew) {
    throw new Error('Journal transactions are immutable and cannot be updated');
  }
});

JournalTransactionSchema.pre('findOneAndUpdate', function() {
  throw new Error('Journal transactions are immutable and cannot be updated via findOneAndUpdate');
});

JournalTransactionSchema.pre('updateOne', function() {
  throw new Error('Journal transactions are immutable and cannot be updated via updateOne');
});

JournalTransactionSchema.pre('updateMany', function() {
  throw new Error('Journal transactions are immutable and cannot be updated via updateMany');
});

JournalTransactionSchema.pre('remove', function() {
  throw new Error('Journal transactions are immutable and cannot be deleted');
});

JournalTransactionSchema.pre('findOneAndDelete', function() {
  throw new Error('Journal transactions are immutable and cannot be deleted via findOneAndDelete');
});

JournalTransactionSchema.pre('deleteOne', function() {
  throw new Error('Journal transactions are immutable and cannot be deleted via deleteOne');
});

JournalTransactionSchema.pre('deleteMany', function() {
  throw new Error('Journal transactions are immutable and cannot be deleted via deleteMany');
});

module.exports = mongoose.model('JournalTransaction', JournalTransactionSchema);
