const express = require("express");
const router = express.Router();
const AWS = require("aws-sdk");
const fs = require("fs");
const archiver = require("archiver");
const path = require("path");

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
  const { awsAccessKeyId, awsSecretAccessKey, lambdaCode, lambdaName } = req.body;
  console.log("🚨 Received Lambda Name:", lambdaName);

  if (!lambdaName || !lambdaCode || !awsAccessKeyId || !awsSecretAccessKey) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  const region = "us-east-1";
  const credentials = {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  };

  const lambda = new AWS.Lambda({ ...credentials, region });
  const iam = new AWS.IAM(credentials);

  try {
    // 1. Create role (or get existing)
    const roleArn = await createLambdaExecutionRole(iam);

    // 2. Zip the Lambda code
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

    // 3. Create or update the Lambda function
    const params = {
      FunctionName: lambdaName,
      Runtime: "nodejs18.x",
      Role: roleArn,
      Handler: "index.handler",
      Code: { ZipFile: zipFileBuffer },
      Timeout: 10,
      Publish: true,
    };

    try {
      await lambda.getFunction({ FunctionName: lambdaName }).promise();
      await lambda
        .updateFunctionCode({
          FunctionName: lambdaName,
          ZipFile: zipFileBuffer,
          Publish: true,
        })
        .promise();
    } catch {
      await lambda.createFunction(params).promise();
    }

    // 4. Create or update Function URL config with public access
    let functionUrlConfig;
    try {
      functionUrlConfig = await lambda.getFunctionUrlConfig({ FunctionName: lambdaName }).promise();

      // Update to ensure AuthType NONE
      if (functionUrlConfig.AuthType !== "NONE") {
        functionUrlConfig = await lambda.updateFunctionUrlConfig({
          FunctionName: lambdaName,
          AuthType: "NONE",
        }).promise();
      }
    } catch {
      // Create if does not exist
      functionUrlConfig = await lambda.createFunctionUrlConfig({
        FunctionName: lambdaName,
        AuthType: "NONE",
      }).promise();
    }

    // 5. Add permission for public invoke (ignore if exists)
    try {
      await lambda.addPermission({
        FunctionName: lambdaName,
        StatementId: "FunctionURLAllowPublicAccess",
        Action: "lambda:InvokeFunctionUrl",
        Principal: "*",
        FunctionUrlAuthType: "NONE",
      }).promise();
      console.log("✅ Public invoke permission added");
    } catch (err) {
      if (err.code === "ResourceConflictException") {
        console.log("Public invoke permission already exists");
      } else {
        throw err;
      }
    }

    // 6. Return the public function URL
    res.status(200).json({
      message: `✅ Lambda '${lambdaName}' deployed successfully with public URL`,
      functionUrl: functionUrlConfig.FunctionUrl,
    });
  } catch (error) {
    console.error("❌ Error creating Lambda:", error);
    res.status(500).json({ error: error.message });
  }
});

// Trigger Lambda
router.post("/trigger", async (req, res) => {
  const { awsAccessKeyId, awsSecretAccessKey, lambdaName } = req.body;

  if (!lambdaName || !awsAccessKeyId || !awsSecretAccessKey) {
    return res.status(400).json({ error: "Missing required parameters." });
  }

  const lambda = new AWS.Lambda({
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
    region: "us-east-1",
  });

  try {
    const result = await lambda
      .invoke({
        FunctionName: lambdaName,
        Payload: JSON.stringify({ trigger: "from-dashboard" }),
      })
      .promise();

    res.status(200).json({ message: `✅ Lambda '${lambdaName}' triggered`, result });
  } catch (err) {
    console.error("❌ Error triggering Lambda:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
