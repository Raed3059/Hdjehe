const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');

// =============================
// ✅ إعدادات البوت
// =============================
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID;

if (!TOKEN) {
  console.error('❌ لم يتم تحديد DISCORD_TOKEN في المتغيرات البيئية!');
  process.exit(1);
}

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent
  ]
});

// =============================
// ✅ تسجيل الأوامر Slash تلقائيًا
// =============================
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');

const rest = new REST({ version: '10' }).setToken(TOKEN);

// ⚠️ استبدل هذا بـ Client ID الخاص بك من https://discord.com/developers/applications
const CLIENT_ID = '1416077051617869927'; // ← ضع هنا معرف التطبيق (Application ID)

const commands = [
  {
    name: 'menu',
    description: 'لوحة تحكم للمالك فقط (يجب أن تكون مالكًا)',
  },
  {
    name: 'setmenu',
    description: 'لوحة الأسئلة للأعضاء للإجابة ورؤية النتائج',
  }
];

async function registerCommands() {
  try {
    console.log('🔄 جارٍ تسجيل الأوامر عالميًا...');
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands }
    );
    console.log('✅ تم تسجيل الأوامر بنجاح عالميًا!');
  } catch (error) {
    console.error('❌ خطأ أثناء تسجيل الأوامر:', error);
  }
}

// =============================
// ✅ قاعدة البيانات
// =============================
let data = {};
const DATA_FILE = './data.json';

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } else {
      data = {
        questions: [],
        allowedRole: null,
        channelId: null,
        attemptTimeWindow: 86400000,
        usersCorrect: [],
        usersIncorrect: [],
        usersAwarded: [],
        userAttempts: {}
      };
      saveData();
    }
  } catch (err) {
    console.error('❌ خطأ في تحميل بيانات البيانات:', err);
    data = {
      questions: [],
      allowedRole: null,
      channelId: null,
      attemptTimeWindow: 86400000,
      usersCorrect: [],
      usersIncorrect: [],
      usersAwarded: [],
      userAttempts: {}
    };
    saveData();
  }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('❌ خطأ في حفظ البيانات:', err);
  }
}

loadData();

// تخزين جلسة إضافة أسئلة للمالك
const adminQuestionSession = {};

// =============================
// ✅ معالجة التفاعلات
// =============================
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit() && !interaction.isButton()) return;

  // ----------------------------
  // أمر /menu للمالك
  // ----------------------------
  if (interaction.isCommand() && interaction.commandName === 'menu') {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ هذا الأمر مخصص للمالك فقط!', ephemeral: true });
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('admin_menu')
        .setPlaceholder('اختر إجراءً...')
        .addOptions([
          { label: 'إضافة أسئلة (جلسة)', value: 'add_questions_session', description: 'أضف عدة أسئلة في جلسة واحدة' },
          { label: 'حذف جميع الأسئلة', value: 'delete_questions', description: 'احذف كل الأسئلة نهائيًا' },
          { label: 'عرض الأسئلة', value: 'show_questions', description: 'اعرض جميع الأسئلة والإجابات' },
          { label: 'تعيين رتبة الفوز', value: 'set_role', description: 'حدد الرتبة التي تُمنح عند الإجابة الصحيحة' },
          { label: 'إزالة رتبة الفوز', value: 'remove_role', description: 'احذف الرتبة المخصصة' },
          { label: 'عدد الإجابات الصحيحة', value: 'count_correct', description: 'عرض عدد الأعضاء الذين أجابوا صح' },
          { label: 'عدد الإجابات الخاطئة', value: 'count_incorrect', description: 'عرض عدد الأعضاء الذين أخطأوا' },
          { label: 'عدد من حصلوا على الرتبة', value: 'count_awarded', description: 'كم شخص حصل على الرتبة؟' },
          { label: 'تعيين قناة التقارير', value: 'set_channel', description: 'اختر قناة لإرسال التقارير' },
          { label: 'تعيين وقت المحاولة', value: 'set_attempt_time', description: 'حدد متى يُسمح بالمحاولة مرة أخرى' }
        ])
    );

    // ✅ ✅ ✅ التعديل الحاسم: استخدام deferReply بدل reply
    await interaction.deferReply({ ephemeral: true });

    // ✅ ثم نرسل القائمة المنبثقة
    await interaction.editReply({ content: '✅ مرحبًا يا أفضل مالك! نورتني ❤️', components: [row] });
  }

  // ----------------------------
  // أمر /setmenu للأعضاء
  // ----------------------------
  if (interaction.isCommand() && interaction.commandName === 'setmenu') {
    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('user_menu')
        .setPlaceholder('اختر إجراءً...')
        .addOptions([
          { label: 'عرض الأسئلة للإجابة', value: 'show_questions_for_user', description: 'شاهد الأسئلة واختر إجاباتك' },
          { label: 'من أجابوا صح؟', value: 'show_correct_users', description: 'عرض قائمة من أجابوا صح' },
          { label: 'محاولاتك المتبقية', value: 'check_attempts', description: 'كم محاولة لديك؟' },
          { label: 'معلوماتي', value: 'my_info', description: 'عرض معلوماتك الشخصية' }
        ])
    );

    // ✅ ✅ ✅ نفس التعديل هنا
    await interaction.deferReply({ ephemeral: true });
    await interaction.editReply({ content: 'مرحبًا بك في لعبة الأسئلة! 🎯 جاوب واحصل على الرتبة تلقائيًا', components: [row] });
  }

  // ----------------------------
  // معالجة القوائم المنبثقة (Dropdowns)
  // ----------------------------
  if (interaction.isStringSelectMenu()) {
    const { customId, values } = interaction;

    if (customId === 'admin_menu') {
      const choice = values[0];
      switch (choice) {
        case 'add_questions_session':
          // ✅ نستخدم deferUpdate() لأننا سنفتح نموذجًا
          await interaction.deferUpdate();
          adminQuestionSession[interaction.user.id] = [];
          await showAddQuestionModal(interaction, true);
          break;
        case 'delete_questions':
          await interaction.showModal(deleteQuestionsModal());
          break;
        case 'show_questions':
          await showAllQuestions(interaction);
          break;
        case 'set_role':
          await interaction.showModal(setRoleModal());
          break;
        case 'remove_role':
          data.allowedRole = null;
          saveData();
          await interaction.reply({ content: '✅ تم إزالة رتبة الفوز.', ephemeral: true });
          break;
        case 'count_correct':
          await showCountEmbed(interaction, 'عدد الأعضاء الذين أجابوا بشكل صحيح:', data.usersCorrect.length, data.usersCorrect.map(id => `<@${id}>`).join(', ') || 'لا أحد');
          break;
        case 'count_incorrect':
          await showCountEmbed(interaction, 'عدد الأعضاء الذين أجابوا خطأ:', data.usersIncorrect.length, data.usersIncorrect.map(id => `<@${id}>`).join(', ') || 'لا أحد');
          break;
        case 'count_awarded':
          await showCountEmbed(interaction, 'عدد الأعضاء الذين حصلوا على الرتبة:', data.usersAwarded.length, data.usersAwarded.map(id => `<@${id}>`).join(', ') || 'لا أحد');
          break;
        case 'set_channel':
          await interaction.showModal(setChannelModal());
          break;
        case 'set_attempt_time':
          await interaction.showModal(setAttemptTimeModal());
          break;
      }
    }

    if (customId === 'user_menu') {
      const choice = values[0];
      switch (choice) {
        case 'show_questions_for_user':
          await showQuestionsForUserModal(interaction);
          break;
        case 'show_correct_users':
          await showCountEmbed(interaction, 'من أجابوا بشكل صحيح:', data.usersCorrect.length, data.usersCorrect.map(id => `<@${id}>`).join(', ') || 'لا أحد');
          break;
        case 'check_attempts':
          const userId = interaction.user.id;
          const remaining = getRemainingAttempts(userId);
          await interaction.reply({
            embeds: [new EmbedBuilder()
              .setTitle('⏳ محاولاتك المتبقية')
              .setDescription(`عدد المحاولات المتبقية: **${remaining}**\nوقت إعادة المحاولة: ${formatTime(data.attemptTimeWindow)} بعد آخر محاولة`)
              .setColor('#FFD700')],
            ephemeral: true
          });
          break;
        case 'my_info':
          const userId2 = interaction.user.id;
          const isCorrect = data.usersCorrect.includes(userId2);
          const isAwarded = data.usersAwarded.includes(userId2);
          const attempts = data.userAttempts[userId2]?.count || 0;
          await interaction.reply({
            embeds: [new EmbedBuilder()
              .setTitle('👤 معلوماتك')
              .addFields(
                { name: 'معرفك', value: `<@${userId2}>`, inline: true },
                { name: 'إجابات صحيحة', value: isCorrect ? '✅ نعم' : '❌ لا', inline: true },
                { name: 'حصلت على الرتبة', value: isAwarded ? '🏆 نعم' : '❌ لا', inline: true },
                { name: 'عدد المحاولات', value: `${attempts}`, inline: true }
              )
              .setColor('#5DADE2')]
            , ephemeral: true
          });
          break;
      }
    }
  }

  // ----------------------------
  // معالجة النماذج (Modals)
  // ----------------------------
  if (interaction.isModalSubmit()) {
    const { customId, fields } = interaction;

    if (customId === 'add_question_modal') {
      const question = fields.getTextInputValue('question');
      const optA = fields.getTextInputValue('opt_a');
      const optB = fields.getTextInputValue('opt_b');
      const optC = fields.getTextInputValue('opt_c');
      const optD = fields.getTextInputValue('opt_d');
      const correct = fields.getTextInputValue('correct');

      const options = [optA, optB, optC, optD];
      const correctIndex = ['A', 'B', 'C', 'D'].indexOf(correct.toUpperCase());

      if (correctIndex === -1) {
        return interaction.reply({ content: '❌ الإجابة الصحيحة يجب أن تكون A, B, C أو D', ephemeral: true });
      }

      if (!adminQuestionSession[interaction.user.id]) {
        adminQuestionSession[interaction.user.id] = [];
      }

      adminQuestionSession[interaction.user.id].push({
        question,
        options,
        correct: correctIndex
      });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('add_another_question')
          .setLabel('+ أضف سؤالًا ثانيًا')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('save_all_questions')
          .setLabel('💾 حفظ الأسئلة')
          .setStyle(ButtonStyle.Success)
      );

      await interaction.reply({
        content: `✅ تم حفظ السؤال:\n**${question}**`,
        components: [row],
        ephemeral: true
      });
    }

    if (customId === 'save_all_questions') {
      const session = adminQuestionSession[interaction.user.id];
      if (!session || session.length === 0) {
        return interaction.reply({ content: '❌ لا توجد أسئلة للحفظ.', ephemeral: true });
      }

      data.questions.push(...session);
      delete adminQuestionSession[interaction.user.id];
      saveData();

      await interaction.reply({
        content: `🎉 تم حفظ ${session.length} أسئلة بنجاح!`,
        ephemeral: true
      });
    }

    if (customId === 'add_another_question') {
      await showAddQuestionModal(interaction, false);
    }

    if (customId === 'delete_questions_confirm') {
      const confirm = fields.getTextInputValue('confirm');
      if (confirm.toLowerCase() !== 'نعم') {
        return interaction.reply({ content: '❌ تم إلغاء الحذف.', ephemeral: true });
      }
      data.questions = [];
      saveData();
      await interaction.reply({ content: '🗑️ تم حذف جميع الأسئلة بنجاح!', ephemeral: true });
    }

    if (customId === 'set_role_modal') {
      const roleId = fields.getTextInputValue('role_id');
      if (!/^\d+$/.test(roleId)) {
        return interaction.reply({ content: '❌ الرتبة يجب أن تكون رقمًا صالحًا (ID)', ephemeral: true });
      }
      data.allowedRole = roleId;
      saveData();
      await interaction.reply({ content: `✅ تم تعيين رتبة الفوز إلى <@&${roleId}>`, ephemeral: true });
    }

    if (customId === 'set_channel_modal') {
      const channelId = fields.getTextInputValue('channel_id');
      if (!/^\d+$/.test(channelId)) {
        return interaction.reply({ content: '❌ معرف القناة يجب أن يكون رقمًا', ephemeral: true });
      }
      data.channelId = channelId;
      saveData();
      await interaction.reply({ content: `✅ تم تعيين قناة التقارير إلى <#${channelId}>`, ephemeral: true });
    }

    if (customId === 'set_attempt_time_modal') {
      const time = fields.getTextInputValue('time');
      let ms;
      switch (time) {
        case '24': ms = 86400000; break;
        case '48': ms = 172800000; break;
        case '72': ms = 259200000; break;
        default: return interaction.reply({ content: '❌ الخيار غير صالح. اختر 24 أو 48 أو 72 ساعة.', ephemeral: true });
      }
      data.attemptTimeWindow = ms;
      saveData();
      await interaction.reply({ content: `✅ تم تعيين وقت المحاولة إلى ${time} ساعة (${formatTime(ms)})`, ephemeral: true });
    }

    if (customId === 'user_answer_modal') {
      await interaction.reply({ content: '✅ تم إرسال إجاباتك، سنقوم بمعالجتها...', ephemeral: true });
    }
  }

  // ----------------------------
  // معالجة أزرار الإجابة (Buttons)
  // ----------------------------
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('answer_')) {
      const questionId = parseInt(interaction.customId.split('_')[1]);
      const selectedOption = parseInt(interaction.customId.split('_')[2]);

      const question = data.questions.find(q => q.id === questionId);
      if (!question) return interaction.reply({ content: '❌ السؤال غير موجود.', ephemeral: true });

      const userId = interaction.user.id;

      const remaining = getRemainingAttempts(userId);
      if (remaining <= 0) {
        return interaction.reply({ content: '❌ لقد استنفذت محاولاتك. انتظر حتى ينتهي الوقت.', ephemeral: true });
      }

      if (!data.userAttempts[userId]) {
        data.userAttempts[userId] = { count: 0, lastUsed: Date.now() };
      }
      data.userAttempts[userId].count++;
      data.userAttempts[userId].lastUsed = Date.now();

      saveData();

      if (selectedOption === question.correct) {
        if (!data.usersCorrect.includes(userId)) {
          data.usersCorrect.push(userId);
        }

        if (data.usersCorrect.length === data.questions.length) {
          if (data.allowedRole) {
            const member = await interaction.guild.members.fetch(userId);
            if (member) {
              await member.roles.add(data.allowedRole);
              if (!data.usersAwarded.includes(userId)) {
                data.usersAwarded.push(userId);
              }
              saveData();
              await interaction.reply({
                content: `🎉 مبروك! أجبت على جميع الأسئلة بشكل صحيح وحصلت على الرتبة <@&${data.allowedRole}>!`,
                ephemeral: true
              });
            }
          } else {
            await interaction.reply({ content: '🎉 أجبت بشكل صحيح! لكن لم تُضبط رتبة للمنح.', ephemeral: true });
          }
        } else {
          await interaction.reply({ content: '✅ إجابة صحيحة! لا تنسَ الإجابة على باقي الأسئلة.', ephemeral: true });
        }
      } else {
        if (!data.usersIncorrect.includes(userId)) {
          data.usersIncorrect.push(userId);
        }
        saveData();
        await interaction.reply({ content: '❌ إجابة خاطئة! حاول مرة أخرى.', ephemeral: true });
      }
    }

    // ✅ معالجة زر "أضف سؤالًا ثانيًا"
    if (interaction.customId === 'add_another_question') {
      await showAddQuestionModal(interaction, false);
    }
  }
});

// ----------------------------
// الدوال المساعدة
// ----------------------------

function getRemainingAttempts(userId) {
  const attempt = data.userAttempts[userId];
  if (!attempt) return 1;

  const elapsed = Date.now() - attempt.lastUsed;
  if (elapsed >= data.attemptTimeWindow) {
    return 1;
  }
  return 0;
}

function formatTime(ms) {
  const hours = Math.floor(ms / 3600000);
  return `${hours} ساعة`;
}

async function showAddQuestionModal(interaction, isFirst) {
  const modal = new ModalBuilder()
    .setCustomId('add_question_modal')
    .setTitle(isFirst ? '📝 أضف أول سؤال' : '➕ أضف سؤالًا جديدًا');

  const questionInput = new TextInputBuilder()
    .setCustomId('question')
    .setLabel('السؤال')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب سؤالك هنا...')
    .setRequired(true);

  const optA = new TextInputBuilder()
    .setCustomId('opt_a')
    .setLabel('الخيار A')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب الخيار الأول')
    .setRequired(true);

  const optB = new TextInputBuilder()
    .setCustomId('opt_b')
    .setLabel('الخيار B')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب الخيار الثاني')
    .setRequired(true);

  const optC = new TextInputBuilder()
    .setCustomId('opt_c')
    .setLabel('الخيار C')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب الخيار الثالث')
    .setRequired(true);

  const optD = new TextInputBuilder()
    .setCustomId('opt_d')
    .setLabel('الخيار D')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب الخيار الرابع')
    .setRequired(true);

  const correctInput = new TextInputBuilder()
    .setCustomId('correct')
    .setLabel('الإجابة الصحيحة (A/B/C/D)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب A أو B أو C أو D')
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(questionInput),
    new ActionRowBuilder().addComponents(optA),
    new ActionRowBuilder().addComponents(optB),
    new ActionRowBuilder().addComponents(optC),
    new ActionRowBuilder().addComponents(optD),
    new ActionRowBuilder().addComponents(correctInput)
  );

  // ✅ فتح النموذج مباشرةً — بعد deferUpdate() أو deferReply()
  await interaction.showModal(modal);
}

function deleteQuestionsModal() {
  const modal = new ModalBuilder()
    .setCustomId('delete_questions_confirm')
    .setTitle('تأكيد حذف الأسئلة');

  const input = new TextInputBuilder()
    .setCustomId('confirm')
    .setLabel('اكتب "نعم" للتأكيد')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('اكتب نعم فقط')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function setRoleModal() {
  const modal = new ModalBuilder()
    .setCustomId('set_role_modal')
    .setTitle('تعيين رتبة الفوز');

  const input = new TextInputBuilder()
    .setCustomId('role_id')
    .setLabel('معرف الرتبة (ID)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('مثال: 123456789012345678')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function setChannelModal() {
  const modal = new ModalBuilder()
    .setCustomId('set_channel_modal')
    .setTitle('تعيين قناة التقارير');

  const input = new TextInputBuilder()
    .setCustomId('channel_id')
    .setLabel('معرف القناة (ID)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('مثال: 123456789012345678')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function setAttemptTimeModal() {
  const modal = new ModalBuilder()
    .setCustomId('set_attempt_time_modal')
    .setTitle('تعيين وقت المحاولة');

  const input = new TextInputBuilder()
    .setCustomId('time')
    .setLabel('عدد الساعات (24 / 48 / 72)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('24 أو 48 أو 72')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

async function showAllQuestions(interaction) {
  if (data.questions.length === 0) {
    return interaction.reply({ content: '❌ لا توجد أسئلة حاليًا.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('📚 جميع الأسئلة والإجابات')
    .setColor('#2ECC71');

  data.questions.forEach(q => {
    const correctOpt = ['A', 'B', 'C', 'D'][q.correct];
    embed.addFields({
      name: `🔹 ${q.question}`,
      value: `**A)** ${q.options[0]}\n**B)** ${q.options[1]}\n**C)** ${q.options[2]}\n**D)** ${q.options[3]}\n\n✅ الإجابة الصحيحة: **${correctOpt}**`,
      inline: false
    });
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showQuestionsForUserModal(interaction) {
  if (data.questions.length === 0) {
    return interaction.reply({ content: '❌ لا توجد أسئلة حاليًا.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('user_answer_modal')
    .setTitle('🎯 إجاباتك على الأسئلة');

  let i = 0;
  for (const q of data.questions) {
    i++;
    const questionField = new TextInputBuilder()
      .setCustomId(`q_${i}_text`)
      .setLabel(`السؤال ${i}:`)
      .setValue(q.question)
      .setStyle(TextInputStyle.Short)
      .setDisabled(true);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`answer_${q.id}_0`)
        .setLabel('A')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`answer_${q.id}_1`)
        .setLabel('B')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`answer_${q.id}_2`)
        .setLabel('C')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`answer_${q.id}_3`)
        .setLabel('D')
        .setStyle(ButtonStyle.Secondary)
    );

    modal.addComponents(
      new ActionRowBuilder().addComponents(questionField),
      row
    );
  }

  const submitButton = new ButtonBuilder()
    .setCustomId('submit_answers')
    .setLabel('✅ إرسال الإجابات')
    .setStyle(ButtonStyle.Success);

  modal.addComponents(new ActionRowBuilder().addComponents(submitButton));

  await interaction.showModal(modal);
}

async function showCountEmbed(interaction, title, count, members) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(members)
    .setColor('#FF9F43')
    .addFields({ name: 'المجموع', value: `**${count}** شخص`, inline: true });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ----------------------------
// تشغيل البوت
// ----------------------------
registerCommands();

client.once('ready', () => {
  console.log(`✅ البوت متصل باسم: ${client.user.tag}`);
  console.log('⚙️ الأوامر المتاحة:');
  console.log('   /menu → للمالك فقط');
  console.log('   /setmenu → للأعضاء');
  console.log('💾 البيانات تُخزن في data.json (مؤقتة على Railway)');
});

client.login(TOKEN);