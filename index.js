const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputStyle, TextInputBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

// ======== التحميل ========
const TOKEN = process.env.DISCORD_TOKEN;
const OWNER_ID = process.env.OWNER_ID || '1079022798523093032'; // ID المالك
const DATA_FILE = path.join(__dirname, 'data.json');

// تحميل البيانات
function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const defaultData = {
      questions: [],
      role_id: null,
      channel_id: null,
      attempt_time_window: 86400, // 24h
      correct_answers: {},
      wrong_answers: {},
      role_given: {},
      attempts: {}
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

// حفظ البيانات
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ======== إنشاء البوت ========
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// ======== تحميل البيانات عند بدء التشغيل ========
let data = loadData();

// ======== حدث بدء التشغيل ========
client.once('ready', () => {
  console.log(`✅ البوت متصل باسم: ${client.user.tag}`);
  console.log(`👑 المالك: ${OWNER_ID}`);
});

// ======== الأمر /setmenu للأعضاء — يعرض كل الأسئلة ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand() && !interaction.isButton() && !interaction.isSelectMenu() && !interaction.isModalSubmit()) return;

  // === أمر /setmenu ===
  if (interaction.commandName === 'setmenu') {
    data = loadData();
    if (data.questions.length === 0) {
      return interaction.reply({ content: '❌ لا توجد أسئلة بعد! يرجى طلب من المالك إضافة أسئلة.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('🧠 اختبر نفسك! - جميع الأسئلة')
      .setDescription('اختر إجابتك لكل سؤال. فقط إذا أجبت على **كل الأسئلة بشكل صحيح**، ستحصل على الرتبة!')
      .setColor('Purple');

    let questionIndex = 0;
    const rows = [];

    data.questions.forEach(q => {
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('أ')
          .setCustomId(`answer_${questionIndex}_a`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('ب')
          .setCustomId(`answer_${questionIndex}_b`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('ج')
          .setCustomId(`answer_${questionIndex}_c`)
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setLabel('د')
          .setCustomId(`answer_${questionIndex}_d`)
          .setStyle(ButtonStyle.Secondary)
      );

      // نضيف وصف السؤال في الإيمبيد
      embed.addFields({
        name: `❓ السؤال ${questionIndex + 1}:`,
        value: `**${q.question}**\n\nأ) ${q.options[0]}\nb) ${q.options[1]}\nc) ${q.options[2]}\nd) ${q.options[3]}`,
        inline: false
      });

      rows.push(row);
      questionIndex++;
    });

    await interaction.reply({ embeds: [embed], components: rows, ephemeral: true });
  }

  // === استجابة الزر (إجابة على سؤال) ===
  if (interaction.isButton() && interaction.customId.startsWith('answer_')) {
    const parts = interaction.customId.split('_');
    const qIndex = parseInt(parts[1]);
    const selectedOption = parts[2];

    data = loadData();
    const question = data.questions[qIndex];
    if (!question) {
      return interaction.editReply({ content: '❌ هذا السؤال غير موجود!', ephemeral: true });
    }

    const userKey = interaction.user.id.toString();
    const isCorrect = selectedOption === question.answer;

    // تحديث إحصائيات المستخدم
    if (isCorrect) {
      data.correct_answers[userKey] = (data.correct_answers[userKey] || 0) + 1;
    } else {
      data.wrong_answers[userKey] = (data.wrong_answers[userKey] || 0) + 1;
    }

    // تعديل الزر الذي ضغط عليه ليصبح "محدد"
    const button = interaction.component;
    button.setStyle(isCorrect ? ButtonStyle.Success : ButtonStyle.Danger);

    // إعادة تكوين الصفوف بعد التحديث
    const updatedRows = [];
    for (let i = 0; i < data.questions.length; i++) {
      const row = new ActionRowBuilder();
      ['a', 'b', 'c', 'd'].forEach(opt => {
        const customId = `answer_${i}_${opt}`;
        const label = opt.toUpperCase();
        const style = data.attempts[userKey]?.[i] === opt 
          ? (data.questions[i].answer === opt ? ButtonStyle.Success : ButtonStyle.Danger)
          : ButtonStyle.Secondary;

        row.addComponents(
          new ButtonBuilder()
            .setLabel(label)
            .setCustomId(customId)
            .setStyle(style)
            .setDisabled(data.attempts[userKey]?.[i] !== undefined)
        );
      });
      updatedRows.push(row);
    }

    // حفظ الإجابة في بيانات المستخدم
    if (!data.attempts[userKey]) data.attempts[userKey] = {};
    data.attempts[userKey][qIndex] = selectedOption;
    saveData(data);

    // التحقق: هل أجاب على جميع الأسئلة؟
    const totalQuestions = data.questions.length;
    const answeredCount = Object.keys(data.attempts[userKey] || {}).length;

    if (answeredCount === totalQuestions) {
      // تحقق من عدد الإجابات الصحيحة
      const correctCount = Object.keys(data.correct_answers).filter(id => id === userKey)[0]
        ? data.correct_answers[userKey] || 0
        : 0;

      // هل أجاب على كل الأسئلة بشكل صحيح؟
      if (correctCount >= totalQuestions) {
        const roleId = data.role_id;
        if (roleId) {
          try {
            const member = await interaction.guild.members.fetch(userKey);
            await member.roles.add(roleId);
            data.role_given[userKey] = true;
            saveData(data);

            embed.setTitle('🎉 مبروك! لقد أجبت على جميع الأسئلة بشكل صحيح!');
            embed.setDescription('✅ تم منحك الرتبة بنجاح!');
            embed.setColor('Gold');
            await interaction.editReply({ embeds: [embed], components: updatedRows });
            
            // إرسال تنبيه في قناة الوك إن وجدت
            if (data.channel_id) {
              const logChannel = client.channels.cache.get(data.channel_id);
              if (logChannel) {
                logChannel.send({
                  embeds: [
                    new EmbedBuilder()
                      .setTitle('🎖️ رتبة منوحة')
                      .setDescription(`<@${userKey}> حصل على الرتبة <@&${roleId}> بعد الإجابة الصحيحة على جميع الأسئلة.`)
                      .setColor('Gold')
                      .setTimestamp()
                  ]
                });
              }
            }
          } catch (e) {
            await interaction.editReply({
              content: '❌ لم أستطع منحك الرتبة — تأكد أن البوت لديه صلاحية "Manage Roles"',
              embeds: [embed],
              components: updatedRows
            });
          }
        } else {
          embed.setTitle('🎉 مبروك! أجبت على جميع الأسئلة بشكل صحيح!');
          embed.setDescription('⚠️ لكن لم يتم تعيين رتبة بعد! اطلب من المالك تعيين رتبة.');
          embed.setColor('Green');
          await interaction.editReply({ embeds: [embed], components: updatedRows });
        }
      } else {
        embed.setTitle('❌ لم تنجح! لديك إجابات خاطئة.');
        embed.setDescription('للحصول على الرتبة، يجب أن تجيب على **جميع** الأسئلة بشكل صحيح.');
        embed.setColor('Red');
        await interaction.editReply({ embeds: [embed], components: updatedRows });
      }
    } else {
      // لا يزال هناك أسئلة لم تُجب عنها
      await interaction.editReply({ embeds: [embed], components: updatedRows });
    }
  }

  // === الأمر /menu للمالك (لم يتغير) ===
  if (interaction.commandName === 'menu') {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ هذا الأمر للمالك فقط!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('✨ مرحبًا يا أفضل مالك! ❤️')
      .setDescription('نورتني يا نجمة السيرفر! 🌟\nاختر ما تريد من القائمة أدناه:')
      .setColor('#FFD700');

    const select = new ActionRowBuilder().addComponents(
      new SelectMenuBuilder()
        .setCustomId('admin_menu')
        .setPlaceholder('اختر إجراء...')
        .addOptions(
          { label: '1. إضافة سؤال', value: 'add_question' },
          { label: '2. حذف جميع الأسئلة', value: 'delete_questions' },
          { label: '3. عرض الأسئلة', value: 'show_questions' },
          { label: '4. إضافة رتبة', value: 'set_role' },
          { label: '5. إزالة الرتبة', value: 'remove_role' },
          { label: '6. عدد الذين أجابت صح', value: 'stats_correct' },
          { label: '7. عدد الذين أجابت خطأ', value: 'stats_wrong' },
          { label: '8. عدد من حصلوا على الرتبة', value: 'stats_gave_role' },
          { label: '9. تعيين قناة الوك', value: 'set_channel' },
          { label: '10. تعيين وقت المحاولة', value: 'set_attempt_time' }
        )
    );

    await interaction.reply({ embeds: [embed], components: [select], ephemeral: true });
  }

  // === استجابة قائمة المالك ===
  if (interaction.isSelectMenu() && interaction.customId === 'admin_menu') {
    const choice = interaction.values[0];
    await interaction.deferUpdate();

    if (choice === 'add_question') {
      await openAddQuestionModal(interaction);
    } else if (choice === 'delete_questions') {
      await confirmDeleteQuestions(interaction);
    } else if (choice === 'show_questions') {
      await showAllQuestions(interaction);
    } else if (choice === 'set_role') {
      await setRolePrompt(interaction);
    } else if (choice === 'remove_role') {
      await removeRole(interaction);
    } else if (choice === 'stats_correct') {
      await statsCorrect(interaction);
    } else if (choice === 'stats_wrong') {
      await statsWrong(interaction);
    } else if (choice === 'stats_gave_role') {
      await statsGaveRole(interaction);
    } else if (choice === 'set_channel') {
      await setChannelPrompt(interaction);
    } else if (choice === 'set_attempt_time') {
      await setAttemptTimePrompt(interaction);
    }
  }

  // === إضافة سؤال (نموذج) ===
  if (interaction.isModalSubmit() && interaction.customId === 'add_question_modal') {
    const q = interaction.fields.getTextInputValue('question');
    const opt1 = interaction.fields.getTextInputValue('option_a');
    const opt2 = interaction.fields.getTextInputValue('option_b');
    const opt3 = interaction.fields.getTextInputValue('option_c');
    const opt4 = interaction.fields.getTextInputValue('option_d');
    const ans = interaction.fields.getTextInputValue('answer').toLowerCase();

    if (!['a', 'b', 'c', 'd'].includes(ans)) {
      return interaction.editReply({ content: '❌ الإجابة يجب أن تكون a, b, c أو d!', ephemeral: true });
    }

    data = loadData();
    data.questions.push({
      question: q,
      options: [opt1, opt2, opt3, opt4],
      answer: ans
    });
    saveData(data);

    const button = new ButtonBuilder()
      .setLabel('➕ إضافة سؤال آخر')
      .setCustomId('add_another_question')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.editReply({
      content: `✅ تم حفظ السؤال:\n**${q}**\nأ) ${opt1}\nب) ${opt2}\nج) ${opt3}\nد) ${opt4}\n✅ الإجابة: ${ans.toUpperCase()}`,
      components: [row]
    });
  }

  if (interaction.isButton() && interaction.customId === 'add_another_question') {
    await openAddQuestionModal(interaction);
  }

  if (interaction.isButton() && interaction.customId === 'confirm_delete') {
    data = loadData();
    data.questions = [];
    saveData(data);
    await interaction.editReply({ content: '🗑️ تم حذف جميع الأسئلة بنجاح!', ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'cancel_delete') {
    await interaction.editReply({ content: '✅ تم إلغاء الحذف.', ephemeral: true });
  }

  if (interaction.isModalSubmit() && interaction.customId === 'set_role_modal') {
    const roleId = interaction.fields.getTextInputValue('role_id');
    data = loadData();
    data.role_id = roleId;
    saveData(data);
    await interaction.editReply({ content: `✅ تم تعيين الرتبة إلى: <@&${roleId}>`, ephemeral: true });
  }

  if (interaction.isModalSubmit() && interaction.customId === 'set_channel_modal') {
    const channelId = interaction.fields.getTextInputValue('channel_id');
    data = loadData();
    data.channel_id = channelId;
    saveData(data);
    await interaction.editReply({ content: `✅ تم تعيين قناة الوك إلى: <#${channelId}>`, ephemeral: true });
  }

  if (interaction.isModalSubmit() && interaction.customId === 'set_attempt_time_modal') {
    const timeValue = interaction.fields.getTextInputValue('time_value');
    data = loadData();
    data.attempt_time_window = parseInt(timeValue);
    saveData(data);
    await interaction.editReply({
      content: `✅ تم تعيين وقت المحاولة إلى: ${timeValue} ثانية (${Math.floor(parseInt(timeValue)/3600)} ساعة)`,
      ephemeral: true
    });
  }

  // === الأوامر الأخرى (لم تتغير) ===
  if (interaction.commandName === 'setmenu') return; // تم التعامل مسبقًا
  if (interaction.isButton() && interaction.customId.startsWith('answer_')) return; // تم التعامل مسبقًا

  // === /stats ===
  if (interaction.commandName === 'stats') {
    data = loadData();
    const total = data.questions.length;
    const correctUsers = Object.keys(data.correct_answers).filter(id => data.correct_answers[id] >= total).length;
    const wrongUsers = Object.keys(data.wrong_answers).length;
    const gaveRole = Object.keys(data.role_given).length;

    const embed = new EmbedBuilder()
      .setTitle('📊 إحصائيات الاختبار')
      .addFields(
        { name: 'عدد الأسئلة', value: `${total}`, inline: true },
        { name: 'من أجابوا صح على الكل', value: `${correctUsers}`, inline: true },
        { name: 'من أجابوا خطأ على الأقل', value: `${wrongUsers}`, inline: true },
        { name: 'من حصلوا على الرتبة', value: `${gaveRole}`, inline: true }
      )
      .setColor('Blue');

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ======== وظائف المساعدة (لم تتغير) ========
async function openAddQuestionModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('add_question_modal')
    .setTitle('➕ إضافة سؤال جديد');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('question')
        .setLabel('السؤال')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('اكتب السؤال هنا...')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('option_a')
        .setLabel('الخيار أ')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: القاهرة')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('option_b')
        .setLabel('الخيار ب')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: الرياض')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('option_c')
        .setLabel('الخيار ج')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: دبي')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('option_d')
        .setLabel('الخيار د')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('مثال: بيروت')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('answer')
        .setLabel('الإجابة الصحيحة (a/b/c/d)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('اكتب a أو b أو c أو d')
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function confirmDeleteQuestions(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('⚠️ تحذير!')
    .setDescription(`هل أنت متأكد أنك تريد حذف **${loadData().questions.length}** سؤالًا؟ هذا الإجراء **غير قابل للعكس**!`)
    .setColor('Red');

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('confirm_delete')
        .setLabel('نعم، احذفها')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('cancel_delete')
        .setLabel('لا، ألغِ')
        .setStyle(ButtonStyle.Secondary)
    );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function showAllQuestions(interaction) {
  data = loadData();
  if (data.questions.length === 0) {
    return interaction.editReply({ content: '❌ لا توجد أسئلة!', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('📚 جميع الأسئلة')
    .setDescription('قائمة الأسئلة مع الإجابات الصحيحة:')
    .setColor('Blue');

  data.questions.forEach((q, i) => {
    const opts = ['أ', 'ب', 'ج', 'د'];
    const optionsStr = opts.map((letter, idx) => `${letter}) ${q.options[idx]}`).join('\n');
    const correct = opts[opts.indexOf(q.answer.toUpperCase())];
    embed.addFields({
      name: `السؤال ${i + 1}: ${q.question}`,
      value: `${optionsStr}\n\n✅ الإجابة الصحيحة: **${correct}**`,
      inline: false
    });
  });

  await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function setRolePrompt(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('set_role_modal')
    .setTitle('🔖 تعيين رتبة الفائز');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('role_id')
        .setLabel('معرف الرتبة (مثال: 123456789012345678)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('أدخل معرف الرتبة هنا...')
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function removeRole(interaction) {
  data = loadData();
  data.role_id = null;
  saveData(data);
  await interaction.editReply({ content: '✅ تم إزالة الرتبة المخصصة!', ephemeral: true });
}

async function statsCorrect(interaction) {
  data = loadData();
  const total = data.questions.length;
  const correct = Object.keys(data.correct_answers).filter(id => data.correct_answers[id] >= total).length;
  const users = Object.keys(data.correct_answers)
    .filter(id => data.correct_answers[id] >= total)
    .map(id => `<@${id}>`)
    .join(', ') || 'لا أحد';

  const embed = new EmbedBuilder()
    .setTitle('🏆 من أجابوا على جميع الأسئلة بشكل صحيح؟')
    .setDescription(`عدد الأشخاص: **${correct}**\n\n${users}`)
    .setColor('Green');

  await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function statsWrong(interaction) {
  data = loadData();
  const wrong = Object.keys(data.wrong_answers).length;
  const users = Object.keys(data.wrong_answers).map(id => `<@${id}>`).join(', ') || 'لا أحد';

  const embed = new EmbedBuilder()
    .setTitle('❌ من أجابوا على بعض الأسئلة خطأ؟')
    .setDescription(`عدد الأشخاص: **${wrong}**\n\n${users}`)
    .setColor('Red');

  await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function statsGaveRole(interaction) {
  data = loadData();
  const gave = Object.keys(data.role_given).length;
  const users = Object.keys(data.role_given).map(id => `<@${id}>`).join(', ') || 'لا أحد';

  const embed = new EmbedBuilder()
    .setTitle('🎖️ من حصلوا على الرتبة؟')
    .setDescription(`عدد الأشخاص: **${gave}**\n\n${users}`)
    .setColor('Gold');

  await interaction.editReply({ embeds: [embed], ephemeral: true });
}

async function setChannelPrompt(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('set_channel_modal')
    .setTitle('📡 تعيين قناة الوك');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('channel_id')
        .setLabel('معرف قناة الوك (مثال: 123456789012345678)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('أدخل معرف القناة هنا...')
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

async function setAttemptTimePrompt(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('set_attempt_time_modal')
    .setTitle('⏱️ تعيين وقت المحاولة');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('time_value')
        .setLabel('عدد الثواني (مثال: 86400 = 24 ساعة)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('86400 (24h), 172800 (48h), 259200 (72h)')
        .setValue('86400')
        .setRequired(true)
    )
  );

  await interaction.showModal(modal);
}

// ======== تسجيل الأوامر ========
client.on('ready', async () => {
  const commands = [
    {
      name: 'menu',
      description: 'قائمة إدارة البوت (المالك فقط)'
    },
    {
      name: 'setmenu',
      description: 'عرض جميع الأسئلة والإجابة عليها'
    },
    {
      name: 'stats',
      description: 'عرض إحصائيات الاختبار'
    }
  ];

  try {
    await client.application.commands.set(commands);
    console.log('✅ تم تسجيل الأوامر!');
  } catch (error) {
    console.error('❌ خطأ في تسجيل الأوامر:', error);
  }
});

// ======== تشغيل البوت ========
client.login(TOKEN);