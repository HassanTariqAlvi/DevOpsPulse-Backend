// const express = require("express");
// const router = express.Router();
// const AWS = require("aws-sdk");

// // Save and Create Lambda Function
// router.post("/save", async (req, res) => {
//   const { awsAccessKeyId, awsSecretAccessKey, lambdaCode } = req.body;

//   const lambda = new AWS.Lambda({
//     accessKeyId: awsAccessKeyId,
//     secretAccessKey: awsSecretAccessKey,
//     region: "us-east-1", // You can change this or pass via frontend
//   });

//   try {
//     const functionName = "DashboardLambdaFunc";
//     const params = {
//       FunctionName: functionName,
//       Runtime: "nodejs18.x",
//       Role: "arn:aws:iam::your-account-id:role/your-lambda-execution-role", // Update this!
//       Handler: "index.handler",
//       Code: {
//         ZipFile: Buffer.from(lambdaCode), // Should be zipped properly in real apps
//       },
//     };

//     const result = await lambda.createFunction(params).promise();
//     res.status(200).json({ message: "Lambda created", functionArn: result.FunctionArn });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: error.message });
//   }
// });

// // Trigger Lambda
// router.post("/trigger", async (req, res) => {
//   const { awsAccessKeyId, awsSecretAccessKey } = req.body;

//   const lambda = new AWS.Lambda({
//     accessKeyId: awsAccessKeyId,
//     secretAccessKey: awsSecretAccessKey,
//     region: "us-east-1",
//   });

//   try {
//     const result = await lambda
//       .invoke({
//         FunctionName: "DashboardLambdaFunc",
//         Payload: JSON.stringify({ trigger: "from-dashboard" }),
//       })
//       .promise();

//     res.status(200).json({ message: result.Payload });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: err.message });
//   }
// });

// module.exports = router;


const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");

const roleName = "DashboardLambdaExecutionRole";

// Helper: Create IAM role for Lambda (if it doesn't exist)
async function createLambdaExecutionRole(iam) {
  const trustPolicy = {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: { Service: "lambda.amazonaws.com" },
        Action: "sts:AssumeRole",
      },
    ],
  };

  try {
    const roleData = await iam
      .createRole({
        RoleName: roleName,
        AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      })
      .promise();

    // Attach inline policy for CloudWatch logging
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: [
            "logs:CreateLogGroup",
            "logs:CreateLogStream",
            "logs:PutLogEvents",
          ],
          Resource: "*",
        },
      ],
    };

    await iam
      .putRolePolicy({
        RoleName: roleName,
        PolicyName: "LambdaBasicExecution",
        PolicyDocument: JSON.stringify(policy),
      })
      .promise();

    return roleData.Role.Arn;
  } catch (err) {
    if (err.code === "EntityAlreadyExists") {
      const { Role } = await iam.getRole({ RoleName: roleName }).promise();
      return Role.Arn;
    }
    throw err;
  }
}

// Save & Deploy Lambda
router.post("/save", async (req, res) => {
  const { awsAccessKeyId, awsSecretAccessKey, lambdaCode } = req.body;
  console.log("🚨 Received Secret Key:", awsSecretAccessKey);

  const region = "us-east-1";
  const credentials = {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  };

  const lambda = new AWS.Lambda({ ...credentials, region });
  const iam = new AWS.IAM(credentials);

  try {
    const functionName = "DashboardLambdaFunc";

    // 1. Create role (or get existing)
    const roleArn = await createLambdaExecutionRole(iam);

    // 2. Zip the Lambda code
    const fs = require("fs");
    const archiver = require("archiver");
    const path = require("path");
    const zipPath = path.join(__dirname, "lambda.zip");
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip");

    archive.pipe(output);
    archive.append(lambdaCode, { name: "index.js" });
    await archive.finalize();

    await new Promise((resolve, reject) => {
      output.on("close", resolve);
      archive.on("error", reject);
    });

    const zipFileBuffer = fs.readFileSync(zipPath);

    // 3. Create the Lambda function
    const params = {
      FunctionName: functionName,
      Runtime: "nodejs18.x",
      Role: roleArn,
      Handler: "index.handler",
      Code: {
        ZipFile: zipFileBuffer,
      },
      Timeout: 10,
      Publish: true,
    };

    // Check if it already exists, then update instead
    try {
      await lambda.getFunction({ FunctionName: functionName }).promise();
      await lambda
        .updateFunctionCode({
          FunctionName: functionName,
          ZipFile: zipFileBuffer,
          Publish: true,
        })
        .promise();
    } catch {
      await lambda.createFunction(params).promise();
    }

    res.status(200).json({ message: "✅ Lambda deployed successfully" });
  } catch (error) {
    console.error("❌ Error creating Lambda:", error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger Lambda
router.post("/trigger", async (req, res) => {
  const { awsAccessKeyId, awsSecretAccessKey } = req.body;

  const lambda = new AWS.Lambda({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    region: "us-east-1",
  });

  try {
    const result = await lambda
      .invoke({
        FunctionName: "DashboardLambdaFunc",
        Payload: JSON.stringify({ trigger: "from-dashboard" }),
      })
      .promise();

    res.status(200).json({ message: "✅ Lambda triggered", result });
  } catch (err) {
    console.error("❌ Error triggering Lambda:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


